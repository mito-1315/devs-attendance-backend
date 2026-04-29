import getSheets from "../middleware/googlesheetsapi.js";

export async function getSaltAndHash(username) {
  const response = await getSheets().spreadsheets.values.get({
    spreadsheetId: process.env.ATTENDANCE_SHEET,
    range: "Sheet1!A:I",   // Reads columns A to I
  });

  const rows = response.data.values;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const sheetUsername = row[0]; // Column A
    const storedHash = row[6];          // Column G
    const saltHex = row[7];          // Column H
    const admin = row[8] || 'FALSE';    // Column I

    if (sheetUsername === username) {
      return {
        found: true,
        saltHex: saltHex || null,
        storedHash: storedHash || null,
        admin: admin,
        row: row || null
      };
    }
  }

  return { found: false };
}