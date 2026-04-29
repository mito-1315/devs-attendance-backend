import { google } from "googleapis";

// ─── Required env var names ────────────────────────────────────────────────────
const REQUIRED_VARS = [
  "GOOGLE_TYPE",
  "GOOGLE_PROJECT_ID",
  "GOOGLE_PRIVATE_KEY_ID",
  "GOOGLE_PRIVATE_KEY",
  "GOOGLE_CLIENT_EMAIL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_AUTH_URI",
  "GOOGLE_TOKEN_URI",
  "GOOGLE_AUTH_PROVIDER_CERT_URL",
  "GOOGLE_CLIENT_CERT_URL",
];

// ─── Lazy singleton — credentials are only read on first API call ──────────────
// This avoids the ES module hoisting problem where top-level import code runs
// before dotenv or --env-file has had a chance to populate process.env.
let _sheets = null;

function getSheets() {
  if (_sheets) return _sheets;

  // Fail-fast: validate all required env vars at first use
  const missing = REQUIRED_VARS.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(
      `[googlesheetsapi] Missing required environment variables: ${missing.join(", ")}\n` +
      "Ensure all GOOGLE_* fields are set in your .env file."
    );
  }

  const credentials = {
    type: process.env.GOOGLE_TYPE,
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
    // dotenv reads \n as literal backslash-n — convert to real newlines
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    client_id: process.env.GOOGLE_CLIENT_ID,
    auth_uri: process.env.GOOGLE_AUTH_URI,
    token_uri: process.env.GOOGLE_TOKEN_URI,
    auth_provider_x509_cert_url: process.env.GOOGLE_AUTH_PROVIDER_CERT_URL,
    client_x509_cert_url: process.env.GOOGLE_CLIENT_CERT_URL,
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  _sheets = google.sheets({ version: "v4", auth });
  return _sheets;
}

export default getSheets;
