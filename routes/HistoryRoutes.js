import express from "express";
import { getHistory, getHistoryEvent, exportHistoryEvent } from "../controller/HistoryController.js";

const router = express.Router();

// GET /api/history - Get all history records
router.get("/", getHistory);

// GET /api/history/event - Get specific event details from history
router.get("/event", getHistoryEvent);

// GET /api/history/event/export - Export event attendance data
router.get("/event/export", exportHistoryEvent);

export default router;
