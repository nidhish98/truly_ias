const users = require("../lib/users");
const otp = require("../lib/otp");
const { json } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { name, email, phone, password, confirmPassword } = req.body;
    if (!name || !email || !phone || !password || !confirmPassword)
      return json(res, 400, { error: "All fields are required" });
    if (password !== confirmPassword)
      return json(res, 400, { error: "Passwords do not match" });

    const existing = await users.findUserByEmail(email);
    if (existing) return json(res, 409, { error: "Email already registered" });

    const existingPhone = await users.findUserByPhone(phone);
    if (existingPhone) return json(res, 409, { error: "Phone number already registered" });

    const requirements = otp.validatePasswordStrength(password);
    if (!requirements.every((r) => r.met))
      return json(res, 400, { error: "Password does not meet requirements" });

    const hashed = otp.hashPassword(password);
    const user = await users.createUser({
      name, email, phone,
      password: hashed,
      mfaEnabled: false, mfaMethod: null, mfaSecret: null,
      emailVerified: false, registered: false,
    });

    const { challenge, otp: otpCode } = await otp.createChallenge(user.id, "registration_email", "email");
    console.log(`\n[SIMULATED EMAIL]\nTo: ${email}\nSubject: SecureID - Email Verification OTP\nOTP: ${otpCode}\n`);

    return json(res, 201, {
      message: "Registration started. Please verify your email.",
      userId: user.id,
      challengeId: challenge.id,
      email: email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
    });
  } catch (err) {
    console.error("Register error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
