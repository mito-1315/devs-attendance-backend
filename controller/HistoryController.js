import { fetchHistory } from '../storage/HistoryStorage.js';
import { fetchDetails, prepareExportData, createExcelFile, createZipFile } from '../storage/attendanceSheetStorage.js';

// In-memory cache for sheet details
const historyEventCache = new Map();

/**
 * Get all history records from SHEET_HISTORY
 * @route GET /api/history
 */
export async function getHistory(req, res) {
    try {
        const historyRecords = await fetchHistory();

        return res.status(200).json({
            success: true,
            message: "History records retrieved successfully",
            data: historyRecords
        });

    } catch (error) {
        console.error("Error fetching history:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch history",
            error: error.message
        });
    }
}

/**
 * Get event details from history and cache it
 * @route GET /api/history/event
 * @param {string} sheet_link - Google Sheet URL (from query params)
 */
export async function getHistoryEvent(req, res) {
    try {
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
        if (historyEventCache.has(spreadsheetId)) {
            const cachedData = historyEventCache.get(spreadsheetId);
            return res.status(200).json({
                success: true,
                message: "Event details retrieved from cache",
                cached: true,
                data: cachedData
            });
        }

        // Fetch details from Google Sheets
        const sheetDetails = await fetchDetails(spreadsheetId);

        // Find column indices
        const headers = sheetDetails.headers;
        const rollNumberIndex = headers.findIndex(h => 
            h && (h.toLowerCase() === 'roll_number' || h.toLowerCase().includes('roll'))
        );
        const nameIndex = headers.findIndex(h => h && h.toLowerCase() === 'name');
        const departmentIndex = headers.findIndex(h => h && h.toLowerCase() === 'department');
        const attendanceIndex = headers.findIndex(h => 
            h && (h.toLowerCase() === 'attendance' || h.toLowerCase() === 'status')
        );
        const typeIndex = headers.findIndex(h => h && h.toLowerCase() === 'type');

        // Calculate counts
        let registeredCount = 0;
        let presentCount = 0;
        let onSpotCount = 0;

        sheetDetails.data.forEach((row) => {
            const typeValue = typeIndex !== -1 ? (row[typeIndex] || '').toString().toUpperCase() : 'REGISTERED';

            // Count registered vs on-spot
            if (typeValue === 'ON-SPOT') {
                onSpotCount++;
            } else {
                registeredCount++;
            }

            // Count present
            const attendanceValue = attendanceIndex !== -1 ? (row[attendanceIndex] || 'FALSE') : 'FALSE';
            let isPresent = false;
            if (typeof attendanceValue === 'boolean') {
                isPresent = attendanceValue;
            } else if (typeof attendanceValue === 'string') {
                const upper = attendanceValue.toUpperCase();
                isPresent = (upper === 'TRUE' || upper === 'YES');
            }
            if (isPresent) {
                presentCount++;
            }
        });

        const absentCount = registeredCount + onSpotCount - presentCount;

        // Transform data for display (all students, not filtered)
        const students = sheetDetails.data.map((row, index) => {
            const rollNumber = row[rollNumberIndex] || '';
            const name = nameIndex !== -1 ? (row[nameIndex] || '') : '';
            const department = departmentIndex !== -1 ? (row[departmentIndex] || '') : '';
            const attendanceValue = attendanceIndex !== -1 ? (row[attendanceIndex] || 'FALSE') : 'FALSE';
            
            let isPresent = false;
            if (typeof attendanceValue === 'boolean') {
                isPresent = attendanceValue;
            } else if (typeof attendanceValue === 'string') {
                const upper = attendanceValue.toUpperCase();
                isPresent = (upper === 'TRUE' || upper === 'YES');
            }

            return {
                id: index + 1,
                rollNumber: rollNumber,
                name: name,
                department: department,
                isPresent: isPresent
            };
        }).filter(student => student.rollNumber); // Filter out empty roll numbers

        const responseData = {
            sheetName: sheetDetails.sheetName,
            spreadsheetId: spreadsheetId,
            registered: registeredCount,
            presentCount: presentCount,
            onSpotCount: onSpotCount,
            absentCount: absentCount,
            students: students
        };

        // Add to cache
        historyEventCache.set(spreadsheetId, responseData);

        return res.status(200).json({
            success: true,
            message: "Event details fetched successfully",
            cached: false,
            data: responseData
        });

    } catch (error) {
        console.error("Error fetching history event:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch event details",
            error: error.message
        });
    }
}

/**
 * Export attendance data for history event
 * @route GET /api/history/event/export
 * @param {string} spreadsheet_id - Spreadsheet ID (from query params)
 */
export async function exportHistoryEvent(req, res) {
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
        const headers = sheetDetails.headers;
        const rollNumberIndex = headers.findIndex(h => 
            h && (h.toLowerCase() === 'roll_number' || h.toLowerCase().includes('roll'))
        );
        const nameIndex = headers.findIndex(h => h && h.toLowerCase() === 'name');
        const departmentIndex = headers.findIndex(h => h && h.toLowerCase() === 'department');
        const attendanceIndex = headers.findIndex(h => 
            h && (h.toLowerCase() === 'attendance' || h.toLowerCase() === 'status')
        );
        const typeIndex = headers.findIndex(h => h && h.toLowerCase() === 'type');

        let registeredCount = sheetDetails.totalRows;
        let presentCount = 0;
        let onSpotCount = 0;

        sheetDetails.data.forEach((row) => {
            const attendanceValue = attendanceIndex !== -1 ? (row[attendanceIndex] || 'FALSE') : 'FALSE';
            let isPresent = false;
            if (typeof attendanceValue === 'boolean') {
                isPresent = attendanceValue;
            } else if (typeof attendanceValue === 'string') {
                const upper = attendanceValue.toUpperCase();
                isPresent = (upper === 'TRUE' || upper === 'YES');
            }
            if (isPresent) {
                presentCount++;
            }

            if (typeIndex !== -1) {
                const typeValue = row[typeIndex] || '';
                if (typeof typeValue === 'string' && typeValue.toUpperCase() === 'ON-SPOT') {
                    onSpotCount++;
                }
            }
        });

        const students = sheetDetails.data.map((row, index) => {
            const rollNumber = row[rollNumberIndex] || '';
            const name = nameIndex !== -1 ? (row[nameIndex] || '') : '';
            const department = departmentIndex !== -1 ? (row[departmentIndex] || '') : '';
            const attendanceValue = attendanceIndex !== -1 ? (row[attendanceIndex] || 'FALSE') : 'FALSE';
            
            let isPresent = false;
            if (typeof attendanceValue === 'boolean') {
                isPresent = attendanceValue;
            } else if (typeof attendanceValue === 'string') {
                const upper = attendanceValue.toUpperCase();
                isPresent = (upper === 'TRUE' || upper === 'YES');
            }

            return {
                id: index + 1,
                rollNumber: rollNumber,
                name: name,
                department: department,
                isPresent: isPresent
            };
        }).filter(student => student.rollNumber);

        const responseData = {
            sheetName: sheetDetails.sheetName,
            spreadsheetId: spreadsheet_id,
            registered: registeredCount,
            presentCount: presentCount,
            onSpotCount: onSpotCount,
            absentCount: registeredCount - presentCount,
            students: students
        };

        historyEventCache.set(spreadsheet_id, responseData);
        console.log('Cache replenished with fresh data');
        
        // Prepare export data
        const { presentStudents, allStudents, presentCount: exportPresentCount } = prepareExportData(sheetDetails);

        if (allStudents.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No student data available to export"
            });
        }

        console.log(`Exporting ${exportPresentCount} present students out of ${allStudents.length} total students`);

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
        console.error("Error exporting history event:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to export attendance",
            error: error.message
        });
    }
}
