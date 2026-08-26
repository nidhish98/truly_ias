const db = require("../database/db");
const mfaService = require("../services/mfaService");

exports.setupMFA = async (req, res) => {
  try {
    const { userId, method } = req.body;
    if (!userId || !method) {
      return res.status(400).json({ error: "User ID and method are required" });
    }
    if (!["email", "sms", "authenticator"].includes(method)) {
      return res.status(400).json({ error: "Invalid MFA method" });
    }

    const user = db.findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (method === "authenticator") {
      const { base32, otpauthUrl } = mfaService.generateSecret(user.email);
      db.updateUser(userId, { mfaSecret: base32, mfaMethod: method });
      const qrCode = await mfaService.generateQRCode(otpauthUrl);

      return res.json({
        method: "authenticator",
        secret: base32,
        qrCode,
        message: "Scan the QR code with your authenticator app",
      });
    }

    db.updateUser(userId, { mfaMethod: method });
    res.json({
      method,
      message: `MFA method set to ${method}. Please verify.`,
    });
  } catch (err) {
    console.error("Setup MFA error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.verifyMFASetup = async (req, res) => {
  try {
    const { userId, token } = req.body;
    if (!userId || !token) {
      return res.status(400).json({ error: "User ID and token are required" });
    }

    const user = db.findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.mfaMethod === "authenticator") {
      if (!user.mfaSecret) {
        return res.status(400).json({ error: "MFA not set up" });
      }
      const valid = mfaService.verifyToken(user.mfaSecret, token);
      if (!valid) {
        return res.status(400).json({ error: "Invalid authenticator code" });
      }
    }

    db.updateUser(userId, { mfaEnabled: true });
    res.json({ message: "MFA enabled successfully" });
  } catch (err) {
    console.error("Verify MFA setup error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};
