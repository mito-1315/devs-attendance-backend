import getSheets from "../middleware/googlesheetsapi.js";

/**
 * Fetch all history records from SHEET_HISTORY
 * @returns {Promise<Array>} - Array of history records
 */
export async function fetchHistory() {
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

    // Skip header row (index 0) and map to objects
    const historyRecords = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      historyRecords.push({
        sheet_name: row[0] || '',
        sheet_link: row[1] || '',
        sheet_id: row[2] || '',
        event_name: row[3] || '',
        uploaded_by: row[4] || '',
        uploaded_at: row[5] || '',
        status: row[6] || '',
        closed_at: row[7] || ''
      });
    }

    // Return in descending order (most recent first)
    return historyRecords.reverse();

  } catch (error) {
    throw new Error(`Failed to fetch history: ${error.message}`);
  }
}
