import express from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";

import routes from "./routes/index.js";

const app = express();

/* ---------- Security Headers (helmet) ---------- */
// Sets X-Content-Type-Options, X-Frame-Options, HSTS, removes X-Powered-By, etc.
app.use(helmet());

/* ---------- CORS ---------- */
// Lock to a specific origin via ALLOWED_ORIGIN env var.
// Falls back to localhost:5173 in development if the var is not set.
// ALLOWED_ORIGIN can be a single origin or a comma-separated list,
// e.g. "http://localhost:5173,https://your-frontend.up.railway.app"
const rawOrigins = process.env.ALLOWED_ORIGIN || "http://localhost:5173";
const allowedOrigins = rawOrigins.split(",").map((o) => o.trim());
app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g. curl, Postman, server-to-server)
            if (!origin) return callback(null, true);
            if (allowedOrigins.includes(origin)) return callback(null, true);
            callback(new Error(`CORS: origin ${origin} not allowed`));
        },
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    })
);

/* ---------- Body Parsers ---------- */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/* ---------- Logging ---------- */
app.use(morgan("dev"));

/* ---------- Routes ---------- */
app.use("/api", routes);

/* ---------- 404 Handler ---------- */
app.use((_req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

/* ---------- Global Error Handler ---------- */
// Must have 4 parameters so Express treats it as an error handler.
// Never expose stack traces in production.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    const isDev = process.env.NODE_ENV !== "production";
    console.error(err);
    res.status(err.status || 500).json({
        success: false,
        message: isDev ? err.message : "Internal server error",
        ...(isDev && { stack: err.stack }),
    });
});

export default app;
