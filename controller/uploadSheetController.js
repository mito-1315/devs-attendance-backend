import { fetchHeaders, fetchData, fetchSpreadsheetName, addToSheetHistory, checkSheetIdExists, addColumnToSheet } from "../storage/uploadSheetStorage.js";

function getSpreadsheetId(url) {
  if (!url || typeof url !== 'string') {
    return null;
  }
  const match = url.match(/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate integer format
 */
function isValidInteger(value) {
  return /^\d+$/.test(value) && !isNaN(parseInt(value));
}

/**
 * Validate checkbox format (TRUE/FALSE or boolean)
 */
function isValidCheckbox(value) {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'string') {
    const upper = value.toUpperCase();
    return upper === 'TRUE' || upper === 'FALSE' || upper === 'YES' || upper === 'NO';
  }
  return false;
}

export async function validateSheet(req, res) {
  // Support both 'sheetlink' and 'sheet_link' for backwards compatibility
  const sheetlink = req.body.sheetlink || req.body.sheet_link;
  if (!sheetlink) {
    return res.status(400).json({ success: false, message: "Missing sheet link in request body (expected 'sheetlink' or 'sheet_link')" });
  }
  const spreadsheetId = getSpreadsheetId(sheetlink);
  if (!spreadsheetId) {
    return res.status(400).json({ success: false, message: "Invalid Google Sheet URL" });
  }

  try {
    // STEP 1: Check if sheet_id already exists in SHEET_HISTORY
    const existingSheet = await checkSheetIdExists(spreadsheetId);
    if (existingSheet) {
      if (existingSheet.status && existingSheet.status.toLowerCase() === 'complete') {
        return res.status(409).json({
          success: false,
          closed: true,
          message: "The sheet is closed",
          data: existingSheet
        });
      }
      return res.status(409).json({ 
        success: false, 
        message: "This sheet has already been uploaded to the system",
        data: existingSheet
      });
    }

    // STEP 2: Check if the sheet is accessible
    let headers;
    try {3
      headers = await fetchHeaders(spreadsheetId);
    } catch (error) {
      return res.status(403).json({ 
        success: false, 
        message: "Sheet is not accessible",
        error: error.message 
      });
    }

    // STEP 2: Validate headers
    const requiredHeaders = ["name", "roll_number", "mail_id", "department", "attendance"];
    const optionalHeaders = ["commit", "type", "marked_by"];
    
    // Trim all headers to remove whitespace
    const trimmedHeaders = headers.map(h => h ? h.trim() : '');
    
    // Filter out empty headers
    const nonEmptyHeaders = trimmedHeaders.filter(h => h !== '');
    
    // Check minimum required headers (5) and maximum with optional (7)
    if (nonEmptyHeaders.length < requiredHeaders.length) {
      return res.status(400).json({ 
        success: false, 
        message: "Header error, check the headers",
        expected: requiredHeaders,
        received: nonEmptyHeaders,
        error: `Expected at least ${requiredHeaders.length} headers, but got ${nonEmptyHeaders.length}`
      });
    }

    if (nonEmptyHeaders.length > requiredHeaders.length + optionalHeaders.length) {
      return res.status(400).json({ 
        success: false, 
        message: "Header error, check the headers",
        expected: [...requiredHeaders, ...optionalHeaders],
        received: nonEmptyHeaders,
        error: `Expected at most ${requiredHeaders.length + optionalHeaders.length} headers, but got ${nonEmptyHeaders.length}`
      });
    }

    // Validate required headers
    for (let i = 0; i < requiredHeaders.length; i++) {
      if (nonEmptyHeaders[i] !== requiredHeaders[i]) {
        return res.status(400).json({ 
          success: false, 
          message: "Header error, check the headers",
          expected: requiredHeaders,
          received: nonEmptyHeaders,
          error: `Expected '${requiredHeaders[i]}' at position ${i + 1}, but got '${nonEmptyHeaders[i]}'`
        });
      }
    }

    // Validate optional headers if present (can be in any order)
    const optionalHeadersPresent = nonEmptyHeaders.slice(5);
    for (const header of optionalHeadersPresent) {
      if (!optionalHeaders.includes(header)) {
        return res.status(400).json({ 
          success: false, 
          message: "Header error, check the headers",
          expected: [...requiredHeaders, ...optionalHeaders],
          received: nonEmptyHeaders,
          error: `Unexpected header '${header}'. Optional headers must be one of: ${optionalHeaders.join(', ')}`
        });
      }
    }

    // Find column indices for optional columns
    const commitIndex = nonEmptyHeaders.indexOf('commit');
    const typeIndex = nonEmptyHeaders.indexOf('type');
    const markedByIndex = nonEmptyHeaders.indexOf('marked_by');

    // STEP 3: Validate data types
    const data = await fetchData(spreadsheetId);
    const errors = [];
    let validRowCount = 0;

    data.forEach((row, rowIndex) => {
      // Skip completely empty rows
      if (!row || row.length === 0 || row.every(cell => !cell || cell.toString().trim() === '')) {
        return;
      }

      validRowCount++;
      const rowNumber = rowIndex + 2; // +2 because row 1 is header and array is 0-indexed
      
      // Validate name (column 0) - String (non-empty)
      if (!row[0] || typeof row[0] !== 'string' || row[0].trim() === '') {
        errors.push({
          row: rowNumber,
          column: "name",
          error: "Name must be a non-empty string",
          value: row[0]
        });
      }

      // Validate roll_number (column 1) - Integer
      if (!row[1] || !isValidInteger(row[1])) {
        errors.push({
          row: rowNumber,
          column: "roll_number",
          error: "Roll number must be a valid integer",
          value: row[1]
        });
      }

      // Validate mail_id (column 2) - Email
      if (!row[2] || !isValidEmail(row[2])) {
        errors.push({
          row: rowNumber,
          column: "mail_id",
          error: "Mail ID must be a valid email address",
          value: row[2]
        });
      }

      // Validate department (column 3) - String (non-empty)
      if (!row[3] || typeof row[3] !== 'string' || row[3].trim() === '') {
        errors.push({
          row: rowNumber,
          column: "department",
          error: "Department must be a non-empty string",
          value: row[3]
        });
      }

      // Validate attendance (column 4) - TRUE/FALSE (can be string or boolean)
      if (row[4] === undefined || row[4] === null || !isValidCheckbox(row[4])) {
        errors.push({
          row: rowNumber,
          column: "attendance",
          error: "Attendance must be TRUE or FALSE (or YES/NO, or boolean)",
          value: row[4]
        });
      }

      // Validate commit - Optional checkbox (TRUE/FALSE)
      if (commitIndex !== -1) {
        if (row[commitIndex] !== undefined && row[commitIndex] !== null && row[commitIndex] !== '' && !isValidCheckbox(row[commitIndex])) {
          errors.push({
            row: rowNumber,
            column: "commit",
            error: "Commit must be TRUE or FALSE (or YES/NO, or boolean) if provided",
            value: row[commitIndex]
          });
        }
      }

      // Validate type - Optional (ON-SPOT or REGISTERED)
      if (typeIndex !== -1) {
        const typeValue = row[typeIndex];
        if (typeValue !== undefined && typeValue !== null && typeValue !== '') {
          const typeUpper = typeValue.toString().toUpperCase();
          if (typeUpper !== 'ON-SPOT' && typeUpper !== 'REGISTERED') {
            errors.push({
              row: rowNumber,
              column: "type",
              error: "Type must be 'ON-SPOT' or 'REGISTERED' if provided",
              value: typeValue
            });
          }
        }
      }

      // Validate marked_by - Optional (String)
      if (markedByIndex !== -1) {
        const markedByValue = row[markedByIndex];
        // marked_by can be empty or a string, just ensure it's valid if provided
        if (markedByValue !== undefined && markedByValue !== null && markedByValue !== '') {
          if (typeof markedByValue !== 'string') {
            errors.push({
              row: rowNumber,
              column: "marked_by",
              error: "marked_by must be a string if provided",
              value: markedByValue
            });
          }
        }
      }
    });

    // If there are validation errors, return them
    if (errors.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: "Data validation failed",
        errors: errors
      });
    }

    // STEP 4: Check if 'type' column exists, if not add it with default 'REGISTERED'
    if (typeIndex === -1) {
      console.log("'type' column not found, adding it with default value 'REGISTERED'");
      await addColumnToSheet(spreadsheetId, "type", "REGISTERED", validRowCount);
    }

    // STEP 5: Check if 'marked_by' column exists, if not add it with default empty string
    if (markedByIndex === -1) {
      console.log("'marked_by' column not found, adding it with default empty value");
      await addColumnToSheet(spreadsheetId, "marked_by", "", validRowCount);
    }

    // All validations passed
    return res.status(200).json({ 
      success: true, 
      message: "Sheet validation successful",
      rowsValidated: validRowCount,
      typeColumnAdded: typeIndex === -1,
      markedByColumnAdded: markedByIndex === -1
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Error validating sheet",
      error: error.message 
    });
  }
}

export async function uploadSheet(req, res) {
  // Support both 'sheetlink' and 'sheet_link' for backwards compatibility
  const sheet_link = req.body.sheet_link || req.body.sheetlink;
  const { event_name, uploaded_by } = req.body;
  // Validate required fields
  if (!sheet_link || !event_name || !uploaded_by) {
    return res.status(400).json({ 
      success: false, 
      message: "Missing required fields: sheet_link (or sheetlink), event_name, and uploaded_by are required" 
    });
  }
  const spreadsheetId = getSpreadsheetId(sheet_link);
  if (!spreadsheetId) {
    return res.status(400).json({ 
      success: false, 
      message: "Invalid Google Sheet URL" 
    });
  }
  // Check if sheet_id already exists in SHEET_HISTORY
  const existingSheet = await checkSheetIdExists(spreadsheetId);
  if (existingSheet) {
    return res.status(409).json({ 
      success: false, 
      message: "This sheet has already been uploaded to the system",
      data: existingSheet
    });
  }

  try {
    // Fetch the sheet name
    let sheetName;
    try {
      sheetName = await fetchSpreadsheetName(spreadsheetId);
    } catch (error) {
      return res.status(403).json({ 
        success: false, 
        message: "Sheet is not accessible",
        error: error.message 
      });
    }

    // Prepare history data
    const historyData = {
      sheet_name: sheetName,
      sheet_link: sheet_link,
      sheet_id: spreadsheetId,
      event_name: event_name,
      uploaded_by: uploaded_by,
      uploaded_at: new Date().toISOString(), // Current timestamp in ISO format
      status: "active",
      closed_at: "" // Leave empty
    };

    // Add to SHEET_HISTORY
    await addToSheetHistory(historyData);

    return res.status(200).json({ 
      success: true, 
      message: "Sheet uploaded to history successfully",
      data: {
        sheet_name: sheetName,
        sheet_id: spreadsheetId,
        event_name: event_name,
        uploaded_by: uploaded_by,
        uploaded_at: historyData.uploaded_at,
        status: "active"
      }
    });

  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      message: "Error uploading sheet to history",
      error: error.message 
    });
  }
}