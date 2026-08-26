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

    const { challenge, otp: otpCode } = await otp.createChallenge(userId, purpose || "registration_email", "email");
    console.log(`\n[SIMULATED EMAIL]\nTo: ${user.email}\nSubject: SecureID - Your OTP Code\nOTP: ${otpCode}\n`);

    return json(res, 200, {
      message: "OTP sent to email",
      challengeId: challenge.id,
      maskedEmail: user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
    });
  } catch (err) {
    console.error("Send email OTP error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
