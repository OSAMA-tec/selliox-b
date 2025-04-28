import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import adminController from "../controller/admin.js";

const router = express.Router();

// Admin middleware to check role
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Admin privileges required."
    });
  }
  next();
};

// Draw management routes
router.get("/draw-management", isAuthenticated, requireAdmin, adminController.getDrawManagementData);
router.post("/run-draw", isAuthenticated, requireAdmin, adminController.runMonthlyDraw);
router.post("/process-payment/:drawId", isAuthenticated, requireAdmin, adminController.processPayment);

export default router; 