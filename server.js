// ⚠️  dotenv MUST be configured before any other imports so that all modules
//     that read process.env at load time (e.g. googlesheetsapi.js) receive
//     the correct values.
import dotenv from "dotenv";
dotenv.config();

import app from "./app.js";

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
