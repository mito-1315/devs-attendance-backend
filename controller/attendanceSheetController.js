import { fetchDetails, ensureCommitColumn, ensureMarkedByColumn, updateCommitStatus, addStudentOnSpot, prepareExportData, createExcelFile, createZipFile } from '../storage/attendanceSheetStorage.js';

// In-memory cache for sheet details
const sheetCache = new Map();

/**
 * Get sheet information and cache it
 * @route GET /api/attendance
 * @param {string} sheet_link - Google Sheet URL (from query params)
 */
export async function informations(req, res) {
    try {
        // Get sheet_link from query params (for GET request)
        const { sheet_link } = req.query;
        
        if (!sheet_link) {
            return res.status(400).json({
                success: false,
                message: "Sheet link is required"
            });
        }

        // Extract spreadsheet ID from the link
        const spreadsheetIdMatch = sheet_link.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
        if (!spreadsheetIdMatch) {
            return res.status(400).json({
                success: false,
                message: "Invalid Google Sheets link"
            });
        }

        const spreadsheetId = spreadsheetIdMatch[1];

        // Check if data is already in cache
        if (sheetCache.has(spreadsheetId)) {
            const cachedData = sheetCache.get(spreadsheetId);
            return res.status(200).json({
                success: true,
                message: "Sheet details retrieved from cache",
                cached: true,
                data: cachedData
            });
        }

        // Fetch details from Google Sheets
        const sheetDetails = await fetchDetails(spreadsheetId);

        // Ensure commit column exists in the sheet
        const commitResult = await ensureCommitColumn(spreadsheetId);
        console.log('Commit column check:', commitResult.message);

        // Ensure marked_by column exists in the sheet
        const markedByResult = await ensureMarkedByColumn(spreadsheetId);
        console.log('marked_by column check:', markedByResult.message);

        // If commit or marked_by column was added, refetch the details to get updated data
        let finalSheetDetails = sheetDetails;
        if (commitResult.commitColumnAdded || markedByResult.markedByColumnAdded) {
            finalSheetDetails = await fetchDetails(spreadsheetId);
        }

        // Add to cache
        sheetCache.set(spreadsheetId, finalSheetDetails);

        return res.status(200).json({
            success: true,
            message: "Sheet details fetched successfully",
            cached: false,
            commitColumnAdded: commitResult.commitColumnAdded,
            markedByColumnAdded: markedByResult.markedByColumnAdded,
            data: finalSheetDetails
        });

    } catch (error) {
        console.error("Error fetching sheet information:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch sheet information",
            error: error.message
        });
    }
}

/**
 * Clear cache for a specific sheet or all sheets
 * @route DELETE /api/attendance/cache
 * @param {string} spreadsheet_id - Optional spreadsheet ID to clear specific cache
 */
export async function clearCache(req, res) {
    try {
        const { spreadsheet_id } = req.body;

        if (spreadsheet_id) {
            // Clear specific sheet cache
            if (sheetCache.has(spreadsheet_id)) {
                sheetCache.delete(spreadsheet_id);
                return res.status(200).json({
                    success: true,
                    message: "Cache cleared for specified sheet"
                });
            } else {
                return res.status(404).json({
                    success: false,
                    message: "No cache found for specified sheet"
                });
            }
        } else {
            // Clear all cache
            sheetCache.clear();
            return res.status(200).json({
                success: true,
                message: "All cache cleared"
            });
        }
    } catch (error) {
        console.error("Error clearing cache:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to clear cache",
            error: error.message
        });
    }
}


/**
 * Display cached sheet data with registered count and roll numbers
 * @route GET /api/attendance/display
 * @param {string} spreadsheet_id - Spreadsheet ID (from query params)
 */
export async function display(req, res) {
    try {
        const { spreadsheet_id } = req.query;

        if (!spreadsheet_id) {
            return res.status(400).json({
                success: false,
                message: "Spreadsheet ID is required"
            });
        }

        // Check if data exists in cache
        if (!sheetCache.has(spreadsheet_id)) {
            return res.status(404).json({
                success: false,
                message: "No cached data found for this spreadsheet. Please fetch information first."
            });
        }

        const cachedData = sheetCache.get(spreadsheet_id);
        
        // Find the index of roll_number, attendance, commit, and type columns in headers
        const headers = cachedData.headers;
        const rollNumberIndex = headers.findIndex(h => 
            h && (h.toLowerCase() === 'roll_number' || h.toLowerCase().includes('roll'))
        );
        const statusIndex = headers.findIndex(h => 
            h && (h.toLowerCase() === 'attendance' || h.toLowerCase() === 'status')
        );
        const commitIndex = headers.findIndex(h => 
            h && h.toLowerCase() === 'commit'
        );
        const typeIndex = headers.findIndex(h => 
            h && h.toLowerCase() === 'type'
        );

        if (rollNumberIndex === -1) {
            return res.status(400).json({
                success: false,
                message: "Roll number column not found in sheet headers"
            });
        }

        if (statusIndex === -1) {
            return res.status(400).json({
                success: false,
                message: "Attendance/Status column not found in sheet headers"
            });
        }

        // Extract roll numbers and status from data, excluding committed students
        const students = cachedData.data.map((row, index) => {
            const rollNumber = row[rollNumberIndex] || '';
            const attendanceValue = statusIndex !== -1 ? (row[statusIndex] || 'FALSE') : 'FALSE';
            const commitValue = commitIndex !== -1 ? (row[commitIndex] || 'FALSE') : 'FALSE';
            
            // Check if student is already committed
            let isCommitted = false;
            if (typeof commitValue === 'boolean') {
                isCommitted = commitValue;
            } else if (typeof commitValue === 'string') {
                const upper = commitValue.toUpperCase();
                isCommitted = (upper === 'TRUE' || upper === 'YES');
            }
            
            // Convert attendance boolean/string to Present/Absent
            let status = 'Absent';
            if (typeof attendanceValue === 'boolean') {
                status = attendanceValue ? 'Present' : 'Absent';
            } else if (typeof attendanceValue === 'string') {
                const upper = attendanceValue.toUpperCase();
                status = (upper === 'TRUE' || upper === 'YES') ? 'Present' : 'Absent';
            }

            return {
                id: index + 1,
                rollNumber: rollNumber,
                status: status,
                isCommitted: isCommitted
            };
        }).filter(student => student.rollNumber && !student.isCommitted); // Filter out empty roll numbers and committed students

        // Calculate counts
        let registeredCount = 0;
        let onSpotCount = 0;
        let totalPresentCount = 0;
        let totalAbsentCount = 0;

        cachedData.data.forEach((row) => {
            const typeValue = typeIndex !== -1 ? (row[typeIndex] || '').toString().toUpperCase() : 'REGISTERED';
            const attendanceValue = statusIndex !== -1 ? (row[statusIndex] || 'FALSE') : 'FALSE';

            let isPresent = false;
            if (typeof attendanceValue === 'boolean') {
                isPresent = attendanceValue;
            } else if (typeof attendanceValue === 'string') {
                const upper = attendanceValue.toUpperCase();
                isPresent = (upper === 'TRUE' || upper === 'YES');
            }

            if (typeValue === 'ON-SPOT') {
                onSpotCount++;
            } else {
                registeredCount++;
            }

            // Present/Absent purely from attendance column
            if (isPresent) {
                totalPresentCount++;
            } else {
                totalAbsentCount++;
            }
        });

        return res.status(200).json({
            success: true,
            message: "Display data retrieved successfully",
            data: {
                registered: registeredCount,
                students: students,
                presentCount: totalPresentCount,
                absentCount: totalAbsentCount,
                onSpotCount: onSpotCount
            }
        });

    } catch (error) {
        console.error("Error displaying sheet data:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to display sheet data",
            error: error.message
        });
    }
}

/**
 * Commit attendance - mark students as committed in Google Sheets
 * @route POST /api/attendance/commit
 * @param {string} spreadsheet_id - Spreadsheet ID
 * @param {Array<string>} roll_numbers - Array of roll numbers with Present status
 * @param {string} username - Username of the person committing
 */
export async function commit(req, res) {
    try {
        const { spreadsheet_id, roll_numbers, username } = req.body;

        if (!spreadsheet_id) {
            return res.status(400).json({
                success: false,
                message: "Spreadsheet ID is required"
            });
        }

        if (!roll_numbers || !Array.isArray(roll_numbers) || roll_numbers.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Roll numbers array is required and must not be empty"
            });
        }

        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Username is required"
            });
        }

        // Update commit status in Google Sheets with username
        const result = await updateCommitStatus(spreadsheet_id, roll_numbers, username);

        // Invalidate cache for this sheet so next fetch gets updated data
        if (sheetCache.has(spreadsheet_id)) {
            sheetCache.delete(spreadsheet_id);
        }

        return res.status(200).json({
            success: true,
            message: result.message,
            data: {
                updatedCount: result.updatedCount,
                committedRollNumbers: roll_numbers
            }
        });

    } catch (error) {
        console.error("Error committing attendance:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to commit attendance",
            error: error.message
        });
    }
}

/**
 * Add student on-spot - adds a new row to the sheet with attendance and commit marked TRUE
 * @route POST /api/attendance/addonspot
 * @param {string} spreadsheet_id - Spreadsheet ID
 * @param {string} name - Student name
 * @param {string} roll_number - Student roll number
 * @param {string} mail_id - Student email ID
 * @param {string} department - Student department
 * @param {string} username - Username of the person adding the student
 */
export async function addOnSpot(req, res) {
    try {
        const { spreadsheet_id, name, roll_number, mail_id, department, username } = req.body;

        if (!spreadsheet_id) {
            return res.status(400).json({
                success: false,
                message: "Spreadsheet ID is required"
            });
        }

        if (!name || !roll_number || !mail_id || !department) {
            return res.status(400).json({
                success: false,
                message: "All student fields are required (name, roll_number, mail_id, department)"
            });
        }

        if (!username) {
            return res.status(400).json({
                success: false,
                message: "Username is required"
            });
        }

        // Add student to Google Sheets with username
        const result = await addStudentOnSpot(spreadsheet_id, {
            name,
            roll_number,
            mail_id,
            department
        }, username);

        // Invalidate cache for this sheet so next fetch gets updated data
        if (sheetCache.has(spreadsheet_id)) {
            sheetCache.delete(spreadsheet_id);
        }

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.studentData
        });

    } catch (error) {
        console.error("Error adding student on-spot:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add student on-spot",
            error: error.message
        });
    }
}

/**
 * Export attendance data as ZIP containing 2 Excel sheets
 * @route GET /api/attendance/export
 * @param {string} spreadsheet_id - Spreadsheet ID (from query params)
 */
export async function exportAttendance(req, res) {
    try {
        const { spreadsheet_id } = req.query;

        if (!spreadsheet_id) {
            return res.status(400).json({
                success: false,
                message: "Spreadsheet ID is required"
            });
        }

        // Fetch fresh data from Google Sheets
        console.log('Fetching fresh data for export...');
        const sheetDetails = await fetchDetails(spreadsheet_id);

        // Replenish cache with fresh data
        sheetCache.set(spreadsheet_id, sheetDetails);
        console.log('Cache replenished with fresh data');
        
        // Prepare export data
        const { presentStudents, allStudents, presentCount } = prepareExportData(sheetDetails);

        if (allStudents.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No student data available to export"
            });
        }

        console.log(`Exporting ${presentCount} present students out of ${allStudents.length} total students`);

        // Create Excel files
        const presentStudentsBuffer = createExcelFile(presentStudents, 'Present Students');
        const allStudentsBuffer = createExcelFile(allStudents, 'All Students');

        // Create ZIP file
        const zipBuffer = await createZipFile({
            'present_students.xlsx': presentStudentsBuffer,
            'all_students.xlsx': allStudentsBuffer
        });

        // Set response headers for file download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="attendance_export_${Date.now()}.zip"`);
        res.setHeader('Content-Length', zipBuffer.length);

        return res.send(zipBuffer);

    } catch (error) {
        console.error("Error exporting attendance:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to export attendance",
            error: error.message
        });
    }
}

