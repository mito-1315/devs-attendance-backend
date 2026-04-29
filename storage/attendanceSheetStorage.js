import getSheets from "../middleware/googlesheetsapi.js";
import XLSX from 'xlsx';
import archiver from 'archiver';

/**
 * Fetch all details from a Google Sheet including headers and data
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @returns {Promise<Object>} - Object containing sheet name, headers, and data
 */
export async function fetchDetails(spreadsheetId) {
  try {
    // Fetch spreadsheet metadata (name)
    const metadataResponse = await getSheets().spreadsheets.get({
      spreadsheetId,
    });
    const sheetName = metadataResponse.data.properties.title;

    // Fetch all data including headers
    const dataResponse = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:Z", // Fetch all columns
    });

    const allRows = dataResponse.data.values || [];

    if (allRows.length === 0) {
      return {
        sheetName,
        headers: [],
        data: [],
        totalRows: 0,
      };
    }

    // First row is headers, rest is data
    const headers = allRows[0];
    const data = allRows.slice(1);

    return {
      sheetName,
      headers,
      data,
      totalRows: data.length,
      spreadsheetId,
    };
  } catch (error) {
    throw new Error(`Failed to fetch sheet details: ${error.message}`);
  }
}

/**
 * Add commit column to sheet if it doesn't already exist
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @returns {Promise<Object>} - Result with commitColumnAdded flag and column index
 */
export async function ensureCommitColumn(spreadsheetId) {
  try {
    // Fetch current headers
    const headerResponse = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A1:Z1",
    });

    const headers = headerResponse.data.values ? headerResponse.data.values[0] : [];

    // Check if commit column already exists
    const commitIndex = headers.findIndex(h =>
      h && h.toLowerCase() === 'commit'
    );

    if (commitIndex !== -1) {
      // Commit column already exists
      return {
        commitColumnAdded: false,
        commitColumnIndex: commitIndex,
        message: "Commit column already exists"
      };
    }

    // Find the next available column (after the last non-empty header)
    const nextColumnIndex = headers.length;
    const nextColumnLetter = getColumnLetter(nextColumnIndex);

    // Add "commit" header
    await getSheets().spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!${nextColumnLetter}1`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [["commit"]]
      }
    });

    // Get the total number of rows with data
    const dataResponse = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:A", // Get column A to count rows
    });

    const totalRows = dataResponse.data.values ? dataResponse.data.values.length : 1;

    // Add FALSE checkboxes for all data rows (excluding header)
    if (totalRows > 1) {
      const checkboxValues = [];
      for (let i = 1; i < totalRows; i++) {
        checkboxValues.push([false]);
      }

      await getSheets().spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!${nextColumnLetter}2:${nextColumnLetter}${totalRows}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: checkboxValues
        }
      });
    }

    return {
      commitColumnAdded: true,
      commitColumnIndex: nextColumnIndex,
      message: "Commit column added successfully"
    };

  } catch (error) {
    throw new Error(`Failed to ensure commit column: ${error.message}`);
  }
}

/**
 * Add marked_by column to sheet if it doesn't already exist
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @returns {Promise<Object>} - Result with markedByColumnAdded flag and column index
 */
export async function ensureMarkedByColumn(spreadsheetId) {
  try {
    // Fetch current headers
    const headerResponse = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A1:Z1",
    });

    const headers = headerResponse.data.values ? headerResponse.data.values[0] : [];

    // Check if marked_by column already exists
    const markedByIndex = headers.findIndex(h =>
      h && h.toLowerCase() === 'marked_by'
    );

    if (markedByIndex !== -1) {
      // marked_by column already exists
      return {
        markedByColumnAdded: false,
        markedByColumnIndex: markedByIndex,
        message: "marked_by column already exists"
      };
    }

    // Find the next available column (after the last non-empty header)
    const nextColumnIndex = headers.length;
    const nextColumnLetter = getColumnLetter(nextColumnIndex);

    // Add "marked_by" header
    await getSheets().spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!${nextColumnLetter}1`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [["marked_by"]]
      }
    });

    // Get the total number of rows with data
    const dataResponse = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:A", // Get column A to count rows
    });

    const totalRows = dataResponse.data.values ? dataResponse.data.values.length : 1;

    // Add empty strings for all data rows (excluding header)
    if (totalRows > 1) {
      const emptyValues = [];
      for (let i = 1; i < totalRows; i++) {
        emptyValues.push([""]);
      }

      await getSheets().spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!${nextColumnLetter}2:${nextColumnLetter}${totalRows}`,
        valueInputOption: "USER_ENTERED",
        resource: {
          values: emptyValues
        }
      });
    }

    return {
      markedByColumnAdded: true,
      markedByColumnIndex: nextColumnIndex,
      message: "marked_by column added successfully"
    };

  } catch (error) {
    throw new Error(`Failed to ensure marked_by column: ${error.message}`);
  }
}

/**
 * Update commit status for specific roll numbers
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @param {Array<string>} rollNumbers - Array of roll numbers to mark as committed
 * @param {string} username - Username of the person committing
 * @returns {Promise<Object>} - Result with updated count
 */
export async function updateCommitStatus(spreadsheetId, rollNumbers, username) {
  try {
    // Fetch current headers and data
    const dataResponse = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:Z",
    });

    const allRows = dataResponse.data.values || [];

    if (allRows.length === 0) {
      throw new Error("Sheet is empty");
    }

    const headers = allRows[0];
    const data = allRows.slice(1);

    // Find column indices
    const rollNumberIndex = headers.findIndex(h =>
      h && (h.toLowerCase() === 'roll_number' || h.toLowerCase().includes('roll'))
    );
    const attendanceIndex = headers.findIndex(h =>
      h && (h.toLowerCase() === 'attendance' || h.toLowerCase() === 'status')
    );
    const commitIndex = headers.findIndex(h =>
      h && h.toLowerCase() === 'commit'
    );
    const markedByIndex = headers.findIndex(h =>
      h && h.toLowerCase() === 'marked_by'
    );

    if (rollNumberIndex === -1) {
      throw new Error("Roll number column not found");
    }
    if (attendanceIndex === -1) {
      throw new Error("Attendance column not found");
    }
    if (commitIndex === -1) {
      throw new Error("Commit column not found");
    }
    if (markedByIndex === -1) {
      throw new Error("marked_by column not found");
    }

    const attendanceColumnLetter = getColumnLetter(attendanceIndex);
    const commitColumnLetter = getColumnLetter(commitIndex);
    const markedByColumnLetter = getColumnLetter(markedByIndex);
    const updates = [];
    let updatedCount = 0;

    // Find rows matching the roll numbers and prepare updates
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const rollNumber = row[rollNumberIndex];

      if (rollNumbers.includes(rollNumber)) {
        const rowNumber = i + 2; // +2 because: 0-indexed array + header row
        // Update attendance column to TRUE
        updates.push({
          range: `Sheet1!${attendanceColumnLetter}${rowNumber}`,
          values: [[true]]
        });
        // Update commit column to TRUE
        updates.push({
          range: `Sheet1!${commitColumnLetter}${rowNumber}`,
          values: [[true]]
        });
        // Update marked_by column with username
        updates.push({
          range: `Sheet1!${markedByColumnLetter}${rowNumber}`,
          values: [[username]]
        });
        updatedCount++;
      }
    }

    // Batch update all columns
    if (updates.length > 0) {
      await getSheets().spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: "USER_ENTERED",
          data: updates
        }
      });
    }

    return {
      success: true,
      updatedCount,
      message: `${updatedCount} students marked as committed by ${username}`
    };

  } catch (error) {
    throw new Error(`Failed to update commit status: ${error.message}`);
  }
}

/**
 * Add a new student on-spot to the sheet
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @param {Object} studentData - Student data {name, roll_number, mail_id, department}
 * @param {string} username - Username of the person adding the student
 * @returns {Promise<Object>} - Result with success status
 */
export async function addStudentOnSpot(spreadsheetId, studentData, username) {
  try {
    const { name, roll_number, mail_id, department } = studentData;

    // Get current sheet structure to find the next row
    const dataResponse = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A:A",
    });

    const totalRows = dataResponse.data.values ? dataResponse.data.values.length : 1;
    const newRowNumber = totalRows + 1;

    // Prepare the new row data: name, roll_number, mail_id, department, attendance=TRUE, commit=TRUE, type=ON-SPOT, marked_by=username
    const newRow = [name, roll_number, mail_id, department, true, true, "ON-SPOT", username];

    // Append the new row
    await getSheets().spreadsheets.values.append({
      spreadsheetId,
      range: `Sheet1!A${newRowNumber}`,
      valueInputOption: "USER_ENTERED",
      resource: {
        values: [newRow]
      }
    });

    return {
      success: true,
      message: `Student added on-spot successfully by ${username}`,
      studentData: {
        name,
        roll_number,
        mail_id,
        department,
        marked_by: username
      }
    };

  } catch (error) {
    throw new Error(`Failed to add student on-spot: ${error.message}`);
  }
}

/**
 * Prepare export data from cached sheet data
 * @param {Object} cachedData - Cached sheet data
 * @returns {Promise<Object>} - Object containing present students and all students data
 */
export function prepareExportData(cachedData) {
  const headers = cachedData.headers;

  // Find column indices
  const nameIndex = headers.findIndex(h => h && h.toLowerCase() === 'name');
  const rollNumberIndex = headers.findIndex(h =>
    h && (h.toLowerCase() === 'roll_number' || h.toLowerCase().includes('roll'))
  );
  const mailIdIndex = headers.findIndex(h =>
    h && (h.toLowerCase() === 'mail_id' || h.toLowerCase().includes('mail'))
  );
  const departmentIndex = headers.findIndex(h => h && h.toLowerCase() === 'department');
  const attendanceIndex = headers.findIndex(h =>
    h && (h.toLowerCase() === 'attendance' || h.toLowerCase() === 'status')
  );
  const typeIndex = headers.findIndex(h => h && h.toLowerCase() === 'type');

  const allStudents = [];
  const presentStudents = [];
  let presentCount = 0;

  cachedData.data.forEach((row) => {
    // Skip empty rows
    if (!row || row.length === 0) return;

    const name = row[nameIndex] || '';
    const rollNumber = row[rollNumberIndex] || '';
    const mailId = row[mailIdIndex] || '';
    const department = row[departmentIndex] || '';
    const attendanceValue = row[attendanceIndex];
    const type = typeIndex !== -1 ? (row[typeIndex] || 'REGISTERED') : 'REGISTERED';

    // Determine if present
    let isPresent = false;
    if (typeof attendanceValue === 'boolean') {
      isPresent = attendanceValue;
    } else if (typeof attendanceValue === 'string') {
      const upper = attendanceValue.toUpperCase();
      isPresent = (upper === 'TRUE' || upper === 'YES');
    }

    const studentData = {
      name,
      roll_number: rollNumber,
      mail_id: mailId,
      department,
      attendance: isPresent ? 'TRUE' : 'FALSE',
      type
    };

    // Add to all students
    allStudents.push(studentData);

    // Add to present students if marked present
    if (isPresent) {
      presentStudents.push(studentData);
      presentCount++;
    }
  });

  return {
    presentStudents,
    allStudents,
    presentCount
  };
}

/**
 * Create Excel workbook with student data
 * @param {Array} data - Array of student objects
 * @param {string} sheetName - Name of the sheet
 * @returns {Buffer} - Excel file buffer
 */
export function createExcelFile(data, sheetName) {
  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Convert data to worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // Generate buffer
  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return buffer;
}

/**
 * Create ZIP file with multiple Excel files
 * @param {Object} files - Object with filename as key and buffer as value
 * @returns {Promise<Buffer>} - ZIP file buffer
 */
export function createZipFile(files) {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', {
      zlib: { level: 9 } // Compression level
    });

    const buffers = [];

    archive.on('data', (chunk) => {
      buffers.push(chunk);
    });

    archive.on('end', () => {
      resolve(Buffer.concat(buffers));
    });

    archive.on('error', (err) => {
      reject(err);
    });

    // Add files to archive
    Object.keys(files).forEach((filename) => {
      archive.append(files[filename], { name: filename });
    });

    // Finalize the archive
    archive.finalize();
  });
}

/**
 * Convert column index to letter (0 = A, 1 = B, 25 = Z, 26 = AA, etc.)
 * @param {number} index - Column index (0-based)
 * @returns {string} - Column letter
 */
function getColumnLetter(index) {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}
