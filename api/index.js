const users = require("../lib/users");
const otp = require("../lib/otp");
const auth = require("../lib/auth");
const mfa = require("../lib/mfa");
const { json, parseCookies, setCookie, clearCookie } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});

  const rawPath = req.url.split("?")[0];
  let path;
  if (rawPath.startsWith("/api/")) {
    path = rawPath.slice(4) || "/";
  } else if (rawPath === "/api") {
    path = "/";
  } else {
    path = rawPath || "/";
  }
  path = path.replace(/\/$/, "") || "/";

  const routes = {
    "POST /register": handleRegister,
    "POST /send-email-otp": handleSendEmailOTP,
    "POST /verify-email-otp": handleVerifyEmailOTP,
    "POST /send-sms-otp": handleSendSMSOTP,
    "POST /verify-sms-otp": handleVerifySMSOTP,
    "POST /login": handleLogin,
    "POST /verify-login-otp": handleVerifyLoginOTP,
    "GET /me": handleMe,
    "POST /logout": handleLogout,
    "POST /token": handleToken,
    "GET /protected": handleProtected,
    "POST /mfa/setup": handleMFASetup,
    "POST /mfa/verify": handleMFAVerify,
  };

  const key = `${req.method} ${path}`;
  const handlerFn = routes[key];

  if (!handlerFn) return json(res, 404, { error: "Not found" });

  try {
    return await handlerFn(req, res);
  } catch (err) {
    console.error(`Error in ${key}:`, err);
    return json(res, 500, { error: "Internal server error" });
  }
};

// ─── Register ────────────────────────────────────────────────
async function handleRegister(req, res) {
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
    name, email, phone, password: hashed,
    mfaEnabled: false, mfaMethod: null, mfaSecret: null,
    emailVerified: false, registered: false,
  });

  const { challenge, otp: otpCode } = await otp.createChallenge(user.id, "registration_email", "email");
  console.log(`\n[SIMULATED EMAIL]\nTo: ${email}\nSubject: SecureID - Email Verification OTP\nOTP: ${otpCode}\n`);

  return json(res, 201, {
    message: "Registration started. Please verify your email.",
    userId: user.id, challengeId: challenge.id,
    email: email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
  });
}

// ─── Send Email OTP ──────────────────────────────────────────
async function handleSendEmailOTP(req, res) {
  const { userId, purpose } = req.body;
  if (!userId) return json(res, 400, { error: "User ID is required" });
  const user = await users.findUserById(userId);
  if (!user) return json(res, 404, { error: "User not found" });

  const { challenge, otp: otpCode } = await otp.createChallenge(userId, purpose || "registration_email", "email");
  console.log(`\n[SIMULATED EMAIL]\nTo: ${user.email}\nSubject: SecureID - Your OTP Code\nOTP: ${otpCode}\n`);

  return json(res, 200, {
    message: "OTP sent to email", challengeId: challenge.id,
    maskedEmail: user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
  });
}

// ─── Verify Email OTP ────────────────────────────────────────
async function handleVerifyEmailOTP(req, res) {
  const { challengeId, otp: otpCode } = req.body;
  if (!challengeId || !otpCode)
    return json(res, 400, { error: "Challenge ID and OTP are required" });

  const result = await otp.verifyOTP(challengeId, otpCode);
  if (result.valid) {
    const ch = await otp.getChallenge(challengeId);
    if (ch) await users.updateUser(ch.userId, { emailVerified: true });
    return json(res, 200, { message: "Email verified successfully", verified: true });
  }

  const response = { verified: false, error: result.reason };
  if (result.attemptsLeft !== undefined) response.attemptsLeft = result.attemptsLeft;
  return json(res, 400, response);
}

// ─── Send SMS OTP ────────────────────────────────────────────
async function handleSendSMSOTP(req, res) {
  const { userId, purpose } = req.body;
  if (!userId) return json(res, 400, { error: "User ID is required" });
  const user = await users.findUserById(userId);
  if (!user) return json(res, 404, { error: "User not found" });

  const { challenge, otp: otpCode } = await otp.createChallenge(userId, purpose || "registration_sms", "sms");
  console.log(`\n[SIMULATED SMS]\nTo: ${user.phone}\nOTP: ${otpCode}\nMessage: Your SecureID verification code is: ${otpCode}\nThis code expires in 10 minutes.\n`);

  return json(res, 200, {
    message: "OTP sent via SMS", challengeId: challenge.id,
    maskedPhone: user.phone.replace(/(\d{2})\d+(\d{2})/, "$1****$2"),
  });
}

// ─── Verify SMS OTP ──────────────────────────────────────────
async function handleVerifySMSOTP(req, res) {
  const { challengeId, otp: otpCode } = req.body;
  if (!challengeId || !otpCode)
    return json(res, 400, { error: "Challenge ID and OTP are required" });

  const result = await otp.verifyOTP(challengeId, otpCode);
  if (result.valid) {
    const ch = await otp.getChallenge(challengeId);
    if (ch) await users.updateUser(ch.userId, { registered: true, mfaEnabled: true, mfaMethod: "sms" });
    return json(res, 200, { message: "SMS verified successfully", verified: true, mfaEnabled: true });
  }

  const response = { verified: false, error: result.reason };
  if (result.attemptsLeft !== undefined) response.attemptsLeft = result.attemptsLeft;
  return json(res, 400, response);
}

// ─── Login ───────────────────────────────────────────────────
async function handleLogin(req, res) {
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
    return json(res, 401, { error: "Invalid email or password", attemptsLeft: Math.max(0, 5 - info.count) });
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
    return json(res, 200, { mfaRequired: true, method: user.mfaMethod, challengeId: challenge.id, userId: user.id });
  }

  const session = await users.createSession(user.id);
  setCookie(res, "sessionId", session.id, { maxAge: 86400 });
  return json(res, 200, {
    message: "Login successful",
    user: { id: user.id, name: user.name, email: user.email },
    accessToken: auth.generateAccessToken(user),
    refreshToken: auth.generateRefreshToken(user),
  });
}

// ─── Verify Login OTP ────────────────────────────────────────
async function handleVerifyLoginOTP(req, res) {
  const { challengeId, otp: otpCode } = req.body;
  if (!challengeId || !otpCode)
    return json(res, 400, { error: "Challenge ID and OTP are required" });

  const challenge = await otp.getChallenge(challengeId);
  if (!challenge) return json(res, 400, { error: "Invalid challenge" });

  const result = await otp.verifyOTP(challengeId, otpCode);
  if (result.valid) {
    const user = await users.findUserById(challenge.userId);
    if (!user) return json(res, 404, { error: "User not found" });
    const session = await users.createSession(user.id);
    setCookie(res, "sessionId", session.id, { maxAge: 86400 });
    return json(res, 200, {
      message: "MFA verification successful",
      user: { id: user.id, name: user.name, email: user.email },
      accessToken: auth.generateAccessToken(user),
      refreshToken: auth.generateRefreshToken(user),
    });
  }

  const response = { verified: false, error: result.reason };
  if (result.attemptsLeft !== undefined) response.attemptsLeft = result.attemptsLeft;
  return json(res, 400, response);
}

// ─── Me ──────────────────────────────────────────────────────
async function handleMe(req, res) {
  const cookies = parseCookies(req);
  if (!cookies.sessionId) return json(res, 401, { error: "Not authenticated" });
  const session = await users.getSession(cookies.sessionId);
  if (!session) return json(res, 401, { error: "Invalid session" });
  const user = await users.findUserById(session.userId);
  if (!user) return json(res, 404, { error: "User not found" });
  return json(res, 200, {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, mfaEnabled: user.mfaEnabled, mfaMethod: user.mfaMethod, emailVerified: user.emailVerified },
  });
}

// ─── Logout ──────────────────────────────────────────────────
async function handleLogout(req, res) {
  const cookies = parseCookies(req);
  if (cookies.sessionId) await users.deleteSession(cookies.sessionId);
  clearCookie(res, "sessionId");
  return json(res, 200, { message: "Logged out successfully" });
}

// ─── Token ───────────────────────────────────────────────────
async function handleToken(req, res) {
  let userId;
  const cookies = parseCookies(req);
  if (cookies.sessionId) {
    const session = await users.getSession(cookies.sessionId);
    if (session) userId = session.userId;
  }
  if (!userId && req.body.refreshToken) {
    const decoded = auth.verifyToken(req.body.refreshToken);
    if (decoded && decoded.type === "refresh") userId = decoded.userId;
  }
  if (!userId) return json(res, 401, { error: "Authentication required" });
  const user = await users.findUserById(userId);
  if (!user) return json(res, 404, { error: "User not found" });
  return json(res, 200, { accessToken: auth.generateAccessToken(user), refreshToken: auth.generateRefreshToken(user) });
}

// ─── Protected ───────────────────────────────────────────────
async function handleProtected(req, res) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer "))
    return json(res, 401, { error: "Access token required" });
  const token = header.split(" ")[1];
  const decoded = auth.verifyToken(token);
  if (!decoded || decoded.type !== "access")
    return json(res, 401, { error: "Invalid or expired token" });
  return json(res, 200, { message: "Access to protected resource granted", user: decoded });
}

// ─── MFA Setup ───────────────────────────────────────────────
async function handleMFASetup(req, res) {
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
}

// ─── MFA Verify ──────────────────────────────────────────────
async function handleMFAVerify(req, res) {
  const { userId, token } = req.body;
  if (!userId || !token) return json(res, 400, { error: "User ID and token are required" });
  const user = await users.findUserById(userId);
  if (!user) return json(res, 404, { error: "User not found" });

  if (user.mfaMethod === "authenticator") {
    if (!user.mfaSecret) return json(res, 400, { error: "MFA not set up" });
    if (!mfa.verifyToken(user.mfaSecret, token))
      return json(res, 400, { error: "Invalid authenticator code" });
  }

  await users.updateUser(userId, { mfaEnabled: true });
  return json(res, 200, { message: "MFA enabled successfully" });
}
