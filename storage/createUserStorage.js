import getSheets from "../middleware/googlesheetsapi.js";

/**
 * Check if a user already exists in the spreadsheet
 * @param {string} username - The username to check
 * @returns {Promise<boolean>} - Returns true if user exists, false otherwise
 */
export async function checkIfUserExist(username) {
  const response = await getSheets().spreadsheets.values.get({
    spreadsheetId: process.env.ATTENDANCE_SHEET,
    range: "Sheet1!A:A", // Read only column A (username column)
  });

  const rows = response.data.values;

  if (!rows || rows.length === 0) {
    return false;
  }

  // Check from row 2 onwards (skip header row)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetUsername = row[0]; // Column A

    if (sheetUsername === username) {
      return true;
    }
  }

  return false;
}

/**
 * Add a new user to the spreadsheet
 * @param {string} username - Username
 * @param {string} name - Full name
 * @param {string} roll_number - Roll number
 * @param {string} department - Department
 * @param {string} team - Team
 * @param {string} role - Role
 * @param {string} hash - Password hash
 * @param {string} salt - Password salt
 * @returns {Promise<boolean>} - Returns true if user added successfully
 */
export async function addUser(username, name, roll_number, department, team, role, hash, salt) {
  try {
    // Convert roll_number to integer
    const rollNumberInt = parseInt(roll_number, 10);

    const response = await getSheets().spreadsheets.values.append({
      spreadsheetId: process.env.ATTENDANCE_SHEET,
      range: "Sheet1!A:H",
      valueInputOption: "RAW",
      requestBody: {
        values: [[username, name, rollNumberInt, department, team, role, hash, salt]],
      },
    });

    return response.data.updates.updatedRows > 0;
  } catch (error) {
    console.error("Error adding user:", error);
    throw error;
  }
}
