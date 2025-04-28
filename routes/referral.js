import express from "express";
import { isAuthenticated } from "../middleware/auth.js";
import referralController from "../controller/referral.js";

const router = express.Router();

// Code generation and validation
router.post("/generate-code", isAuthenticated, referralController.generateReferralCode);
router.get("/validate-code/:code", referralController.validateReferralCode);

// User referral dashboard
router.get("/user-data", isAuthenticated, referralController.getUserReferralData);
router.post("/apply-code", isAuthenticated, referralController.applyReferralCode);
router.post("/choose-reward", isAuthenticated, referralController.chooseReward);

// Draw entries and payment details
router.post("/payment-details", isAuthenticated, referralController.submitPaymentDetails);
router.get("/check-winner", isAuthenticated, referralController.checkWinnerStatus);

// Notifications
router.get("/notifications", isAuthenticated, referralController.getReferralNotifications);
router.post("/notifications/read/:notificationId", isAuthenticated, referralController.markNotificationAsRead);
router.post("/notifications/read-all", isAuthenticated, referralController.markAllNotificationsAsRead);

export default router; 