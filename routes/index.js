import express from "express";
import loginRoutes from "./loginRoutes.js";
import createUserRoutes from "./createUserRoutes.js";
import uploadSheetRoutes from "./uploadSheetRoutes.js";
import attendanceSheetRoutes from "./attendanceSheetRoutes.js";
import historyRoutes from "./HistoryRoutes.js";
import profileRoutes from "./profileRoutes.js";

const router = express.Router();

router.use("/login", loginRoutes);
router.use("/createuser",createUserRoutes);
router.use("/upload",uploadSheetRoutes);
router.use("/attendance",attendanceSheetRoutes);
router.use("/history",historyRoutes);
router.use("/profile",profileRoutes);
router.get("/health",(req,res)=>{
    console.log("/health is called")
    res.json({
        success:true,
        status:"server is running"
    })
})




export default router;
