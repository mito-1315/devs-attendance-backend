import getSheets from "../middleware/googlesheetsapi.js";

/**
 * Fetch the spreadsheet name
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @returns {Promise<string>} - Name of the spreadsheet
 */
export async function fetchSpreadsheetName(spreadsheetId) {
  try {
    const response = await getSheets().spreadsheets.get({
      spreadsheetId,
    });

    return response.data.properties.title;
  } catch (error) {
    throw new Error(`Failed to fetch spreadsheet name: ${error.message}`);
  }
}

/**
 * Fetch headers from the first row of the sheet
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @returns {Promise<Array<string>>} - Array of header values
 */
export async function fetchHeaders(spreadsheetId) {
  try {
    const response = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A1:Z1", // Fetch first row
    });

    const headers = response.data.values ? response.data.values[0] : [];
    return headers;
  } catch (error) {
    throw new Error(`Failed to fetch headers: ${error.message}`);
  }
}

/**
 * Fetch all data from the sheet except headers
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @returns {Promise<Array<Array<any>>>} - 2D array of data rows
 */
export async function fetchData(spreadsheetId) {
  try {
    const response = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A2:E", // Fetch from row 2 onwards (skip header)
    });

    const data = response.data.values || [];
    return data;
  } catch (error) {
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
}

/**
 * Check if a sheet_id already exists in SHEET_HISTORY
 * @param {string} sheetId - The sheet ID to check
 * @returns {Promise<Object|null>} - Returns sheet data if exists, null otherwise
 */
export async function checkSheetIdExists(sheetId) {
  try {
    const historySpreadsheetId = process.env.SHEET_HISTORY;

    if (!historySpreadsheetId) {
      throw new Error("SHEET_HISTORY environment variable is not set");
    }

    // Fetch all data from SHEET_HISTORY
    const response = await getSheets().spreadsheets.values.get({
      spreadsheetId: historySpreadsheetId,
      range: "Sheet1!A:H", // All columns: sheet_name, sheet_link, sheet_id, event_name, uploaded_by, uploaded_at, status, closed_at
    });

    const rows = response.data.values || [];

    // Skip header row (index 0) and check if sheetId exists
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][2] === sheetId) { // Column C (index 2) contains sheet_id
        return {
          sheet_name: rows[i][0],
          sheet_link: rows[i][1],
          sheet_id: rows[i][2],
          event_name: rows[i][3],
          uploaded_by: rows[i][4],
          uploaded_at: rows[i][5],
          status: rows[i][6],
          closed_at: rows[i][7] || ""
        };
      }
    }

    return null;
  } catch (error) {
    throw new Error(`Failed to check sheet_id existence: ${error.message}`);
  }
}

/**
 * Add a column with default values to the sheet
 * @param {string} spreadsheetId - The ID of the Google Sheet
 * @param {string} columnName - Name of the column to add
 * @param {string} defaultValue - Default value for all rows
 * @param {number} dataRowCount - Number of data rows (excluding header)
 * @returns {Promise<void>}
 */
export async function addColumnToSheet(spreadsheetId, columnName, defaultValue, dataRowCount) {
  try {
    // First, get current headers to find next available column
    const headersResponse = await getSheets().spreadsheets.values.get({
      spreadsheetId,
      range: "Sheet1!A1:Z1",
    });

    const currentHeaders = headersResponse.data.values ? headersResponse.data.values[0] : [];
    const nextColumnIndex = currentHeaders.length;
    const columnLetter = String.fromCharCode(65 + nextColumnIndex); // A=65, B=66, etc.

    // Add header
    await getSheets().spreadsheets.values.update({
      spreadsheetId,
      range: `Sheet1!${columnLetter}1`,
      valueInputOption: "RAW",
      resource: {
        values: [[columnName]]
      }
    });

    // Add default values for all data rows
    if (dataRowCount > 0) {
      const defaultValues = Array(dataRowCount).fill([defaultValue]);
      await getSheets().spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!${columnLetter}2:${columnLetter}${dataRowCount + 1}`,
        valueInputOption: "RAW",
        resource: {
          values: defaultValues
        }
      });
    }

    console.log(`Added column '${columnName}' with default value '${defaultValue}' to ${dataRowCount} rows`);
  } catch (error) {
    throw new Error(`Failed to add column to sheet: ${error.message}`);
  }
}

/**
 * Add a row to SHEET_HISTORY spreadsheet
 * @param {Object} historyData - Data to add to history
 * @param {string} historyData.sheet_name - Name of the sheet
 * @param {string} historyData.sheet_link - Link to the sheet
 * @param {string} historyData.sheet_id - ID of the sheet
 * @param {string} historyData.event_name - Name of the event
 * @param {string} historyData.uploaded_by - Username of the uploader
 * @param {string} historyData.uploaded_at - Timestamp of upload
 * @param {string} historyData.status - Status (e.g., "active")
 * @returns {Promise<void>}
 */
export async function addToSheetHistory(historyData) {
  try {
    const historySpreadsheetId = process.env.SHEET_HISTORY;

    if (!historySpreadsheetId) {
      throw new Error("SHEET_HISTORY environment variable is not set");
    }

    const values = [[
      historyData.sheet_name,
      historyData.sheet_link,
      historyData.sheet_id,
      historyData.event_name,
      historyData.uploaded_by,
      historyData.uploaded_at,
      historyData.status,
      historyData.closed_at || "" // Leave empty if not provided
    ]];

    await getSheets().spreadsheets.values.append({
      spreadsheetId: historySpreadsheetId,
      range: "Sheet1!A:H", // Assuming SHEET_HISTORY is in Sheet1
      valueInputOption: "RAW",
      resource: {
        values: values
      }
    });

    return { success: true };
  } catch (error) {
    throw new Error(`Failed to add to sheet history: ${error.message}`);
  }
}
