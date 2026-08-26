const users = require("../lib/users");
const otp = require("../lib/otp");
const auth = require("../lib/auth");
const { json, setCookie } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { challengeId, otp: otpCode } = req.body;
    if (!challengeId || !otpCode)
      return json(res, 400, { error: "Challenge ID and OTP are required" });

    const challenge = await otp.getChallenge(challengeId);
    if (!challenge) return json(res, 400, { error: "Invalid challenge" });

    const result = await otp.verifyOTP(challengeId, otpCode);

    if (result.valid) {
      const user = await users.findUserById(challenge.userId);
      if (!user) return json(res, 404, { error: "User not found" });

      const session = await users.createSession(user.id, { ip: req.headers["x-forwarded-for"] || "" });
      const accessToken = auth.generateAccessToken(user);
      const refreshToken = auth.generateRefreshToken(user);

      setCookie(res, "sessionId", session.id, { maxAge: 86400 });

      return json(res, 200, {
        message: "MFA verification successful",
        user: { id: user.id, name: user.name, email: user.email },
        accessToken,
        refreshToken,
      });
    }

    const response = { verified: false, error: result.reason };
    if (result.attemptsLeft !== undefined) response.attemptsLeft = result.attemptsLeft;
    return json(res, 400, response);
  } catch (err) {
    console.error("Verify login OTP error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
