const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const mfaController = require("../controllers/mfaController");
const { authenticateSession, authenticateJWT } = require("../middleware/auth");

router.post("/register", authController.register);
router.post("/send-email-otp", authController.sendEmailOTP);
router.post("/verify-email-otp", authController.verifyEmailOTP);
router.post("/send-sms-otp", authController.sendSMSOTP);
router.post("/verify-sms-otp", authController.verifySMSOTP);
router.post("/login", authController.login);
router.post("/verify-login-otp", authController.verifyLoginOTP);
router.get("/me", authenticateSession, authController.me);
router.post("/logout", authController.logout);
router.post("/token", authController.refreshToken);
router.get("/protected", authenticateJWT, authController.getProtected);
router.post("/mfa/setup", mfaController.setupMFA);
router.post("/mfa/verify", mfaController.verifyMFASetup);

module.exports = router;
