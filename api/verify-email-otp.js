const users = require("../lib/users");
const otp = require("../lib/otp");
const { json } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { challengeId, otp: otpCode } = req.body;
    if (!challengeId || !otpCode)
      return json(res, 400, { error: "Challenge ID and OTP are required" });

    const result = await otp.verifyOTP(challengeId, otpCode);

    if (result.valid) {
      const challenge = await otp.getChallenge(challengeId);
      if (challenge) await users.updateUser(challenge.userId, { emailVerified: true });
      return json(res, 200, { message: "Email verified successfully", verified: true });
    }

    const response = { verified: false, error: result.reason };
    if (result.attemptsLeft !== undefined) response.attemptsLeft = result.attemptsLeft;
    return json(res, 400, response);
  } catch (err) {
    console.error("Verify email OTP error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
