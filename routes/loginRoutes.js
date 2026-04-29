import express from "express";
import { loginCheck } from '../controller/loginController.js';


const router=express.Router()

router.post('/',loginCheck);

export default router;