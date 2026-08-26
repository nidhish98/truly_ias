const users = require("../lib/users");
const otp = require("../lib/otp");
const auth = require("../lib/auth");
const { json, setCookie, parseCookies } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { email, password } = req.body;
    if (!email || !password)
      return json(res, 400, { error: "Email and password are required" });

    const lockInfo = await users.getFailedLogins(email);
    if (lockInfo.lockedUntil && Date.now() < lockInfo.lockedUntil) {
      const remaining = Math.ceil((lockInfo.lockedUntil - Date.now()) / 60000);
      return json(res, 423, { error: "Account temporarily locked", lockedMinutes: remaining });
    }

    const user = await users.findUserByEmail(email);
    if (!user || !otp.comparePassword(password, user.password)) {
      await users.incrementFailedLogins(email);
      const info = await users.getFailedLogins(email);
      return json(res, 401, {
        error: "Invalid email or password",
        attemptsLeft: Math.max(0, 5 - info.count),
      });
    }

    await users.resetFailedLogins(email);

    if (!user.registered)
      return json(res, 403, { error: "Account not fully registered. Please complete registration." });

    if (user.mfaEnabled) {
      const { challenge, otp: otpCode } = await otp.createChallenge(user.id, "login_mfa", user.mfaMethod);
      if (user.mfaMethod === "email") {
        console.log(`\n[SIMULATED EMAIL]\nTo: ${user.email}\nSubject: SecureID - Login Verification\nOTP: ${otpCode}\n`);
      } else if (user.mfaMethod === "sms") {
        console.log(`\n[SIMULATED SMS]\nTo: ${user.phone}\nOTP: ${otpCode}\nMessage: Your SecureID login code is: ${otpCode}\nThis code expires in 10 minutes.\n`);
      }
      return json(res, 200, {
        mfaRequired: true,
        method: user.mfaMethod,
        challengeId: challenge.id,
        userId: user.id,
      });
    }

    const session = await users.createSession(user.id, { ip: req.headers["x-forwarded-for"] || "" });
    const accessToken = auth.generateAccessToken(user);
    const refreshToken = auth.generateRefreshToken(user);

    setCookie(res, "sessionId", session.id, { maxAge: 86400 });

    return json(res, 200, {
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
