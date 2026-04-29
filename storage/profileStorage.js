import getSheets from "../middleware/googlesheetsapi.js";

/**
 * Fetch user profile data by username from ATTENDANCE_SHEET
 * @param {string} username - The username to query
 * @returns {Promise<Object>} - User profile data
 */
export async function getUserProfile(username) {
  try {
    const response = await getSheets().spreadsheets.values.get({
      spreadsheetId: process.env.ATTENDANCE_SHEET,
      range: "Sheet1!A:F", // username, name, roll_number, department, team, role
    });

    const rows = response.data.values || [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const sheetUsername = row[0]; // Column A

      if (sheetUsername === username) {
        return {
          found: true,
          user: {
            username: row[0] || '',
            name: row[1] || '',
            roll_number: row[2] || '',
            department: row[3] || '',
            team: row[4] || '',
            role: row[5] || ''
          }
        };
      }
    }

    return { found: false };
  } catch (error) {
    throw new Error(`Failed to fetch user profile: ${error.message}`);
  }
}

/**
 * Fetch all sessions created by a specific user from SHEET_HISTORY
 * @param {string} username - The username to query
 * @returns {Promise<Array>} - Array of session objects
 */
export async function getUserSessions(username) {
  try {
    const historySpreadsheetId = process.env.SHEET_HISTORY;

    if (!historySpreadsheetId) {
      throw new Error("SHEET_HISTORY environment variable is not set");
    }

    // Fetch all data from SHEET_HISTORY
    const response = await getSheets().spreadsheets.values.get({
      spreadsheetId: historySpreadsheetId,
      range: "Sheet1!A:H", // sheet_name, sheet_link, sheet_id, event_name, uploaded_by, uploaded_at, status, closed_at
    });

    const rows = response.data.values || [];
    const sessions = [];

    // Skip header row (index 0) and filter by username
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const uploadedBy = row[4]; // Column E (uploaded_by)

      if (uploadedBy === username) {
        sessions.push({
          id: row[2] || '', // sheet_id
          name: row[3] || '', // event_name
          sheet_name: row[0] || '',
          sheet_link: row[1] || '',
          uploaded_at: row[5] || '',
          status: row[6] || 'Active', // status (Active or Complete)
          closed_at: row[7] || ''
        });
      }
    }

    // Return in descending order (most recent first)
    return sessions.reverse();
  } catch (error) {
    throw new Error(`Failed to fetch user sessions: ${error.message}`);
  }
}

/**
 * Close a session by setting status=Complete and closed_at timestamp
 * @param {string} username - The username closing the session
 * @param {string} sheet_id - The sheet ID of the session to close
 * @returns {Promise<Object>} - Result with success status and closed_at
 */
export async function closeSession(username, sheet_id) {
  try {
    const historySpreadsheetId = process.env.SHEET_HISTORY;

    if (!historySpreadsheetId) {
      throw new Error("SHEET_HISTORY environment variable is not set");
    }

    // Fetch all data from SHEET_HISTORY
    const response = await getSheets().spreadsheets.values.get({
      spreadsheetId: historySpreadsheetId,
      range: "Sheet1!A:H",
    });

    const rows = response.data.values || [];

    // Find the row where sheet_id matches (column C, index 2)
    let targetRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][2] === sheet_id) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { success: false, message: "Session not found" };
    }

    // Verify uploaded_by (column E, index 4) matches username
    const uploadedBy = rows[targetRowIndex][4];
    if (uploadedBy !== username) {
      return { success: false, message: "Unauthorized: session does not belong to this user" };
    }

    // Check if already closed
    const currentStatus = (rows[targetRowIndex][6] || '').toLowerCase();
    if (currentStatus === 'complete') {
      return { success: false, message: "Session is already closed" };
    }

    // Sheet row number is 1-based (targetRowIndex + 1)
    const sheetRow = targetRowIndex + 1;
    const closedAt = new Date().toISOString();

    // Update status (column G) and closed_at (column H)
    await getSheets().spreadsheets.values.batchUpdate({
      spreadsheetId: historySpreadsheetId,
      resource: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `Sheet1!G${sheetRow}`,
            values: [["Complete"]]
          },
          {
            range: `Sheet1!H${sheetRow}`,
            values: [[closedAt]]
          }
        ]
      }
    });

    return { success: true, closed_at: closedAt };
  } catch (error) {
    throw new Error(`Failed to close session: ${error.message}`);
  }
}
