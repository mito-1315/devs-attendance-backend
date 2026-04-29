import express from "express";
import { createUser } from '../controller/createUserController.js';

const router=express.Router()

router.post('/',createUser);

export default router;