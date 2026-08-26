const users = require("../lib/users");
const otp = require("../lib/otp");
const { json } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { userId, purpose } = req.body;
    if (!userId) return json(res, 400, { error: "User ID is required" });

    const user = await users.findUserById(userId);
    if (!user) return json(res, 404, { error: "User not found" });

    const { challenge, otp: otpCode } = await otp.createChallenge(userId, purpose || "registration_sms", "sms");
    console.log(`\n[SIMULATED SMS]\nTo: ${user.phone}\nOTP: ${otpCode}\nMessage: Your SecureID verification code is: ${otpCode}\nThis code expires in 10 minutes.\n`);

    return json(res, 200, {
      message: "OTP sent via SMS",
      challengeId: challenge.id,
      maskedPhone: user.phone.replace(/(\d{2})\d+(\d{2})/, "$1****$2"),
    });
  } catch (err) {
    console.error("Send SMS OTP error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
