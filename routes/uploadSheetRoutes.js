import express from "express";
import { validateSheet, uploadSheet } from "../controller/uploadSheetController.js";

const router=express.Router()

router.post('/validate',validateSheet);
router.post('/uploadSheet',uploadSheet);


export default router;