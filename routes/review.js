import express from "express";

import ReviewController from "../controller/review.js";
import { isAuthenticated, requiredRoles } from "../middleware/auth.js";

const router = express.Router();


router.post(
  "/create",
  isAuthenticated,
  requiredRoles("buyer"),
  ReviewController.create
);

export default router;
