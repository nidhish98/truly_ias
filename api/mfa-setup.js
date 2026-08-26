const users = require("../lib/users");
const mfa = require("../lib/mfa");
const { json } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { userId, method } = req.body;
    if (!userId || !method) return json(res, 400, { error: "User ID and method are required" });
    if (!["email", "sms", "authenticator"].includes(method))
      return json(res, 400, { error: "Invalid MFA method" });

    const user = await users.findUserById(userId);
    if (!user) return json(res, 404, { error: "User not found" });

    if (method === "authenticator") {
      const { base32, otpauthUrl } = mfa.generateSecret(user.email);
      await users.updateUser(userId, { mfaSecret: base32, mfaMethod: method });
      const qrCode = await mfa.generateQRCode(otpauthUrl);
      return json(res, 200, { method: "authenticator", secret: base32, qrCode, message: "Scan the QR code with your authenticator app" });
    }

    await users.updateUser(userId, { mfaMethod: method });
    return json(res, 200, { method, message: `MFA method set to ${method}. Please verify.` });
  } catch (err) {
    console.error("Setup MFA error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
