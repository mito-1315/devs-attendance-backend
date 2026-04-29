import express from "express";
import { getProfile, getSession, closeSessionController } from "../controller/profileController.js";

const router = express.Router();

// Get user profile data
router.post("/", getProfile);
router.post("/getsession", getSession);
router.post("/close", closeSessionController);

export default router;
