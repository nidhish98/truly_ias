const db = require("../database/db");
const otpService = require("../services/otpService");
const authService = require("../services/authService");

exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body;

    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }
    if (db.findUserByEmail(email)) {
      return res.status(409).json({ error: "Email already registered" });
    }
    if (db.findUserByPhone(phone)) {
      return res.status(409).json({ error: "Phone number already registered" });
    }

    const requirements = otpService.validatePasswordStrength(password);
    const allMet = requirements.every((r) => r.met);
    if (!allMet) {
      return res.status(400).json({ error: "Password does not meet requirements" });
    }

    const hashedPassword = otpService.hashPassword(password);
    const user = db.createUser({
      name,
      email,
      phone,
      password: hashedPassword,
      mfaEnabled: false,
      mfaMethod: null,
      mfaSecret: null,
      emailVerified: false,
      registered: false,
    });

    const { challenge, otp } = otpService.createOTPChallenge(user.id, "registration_email", "email");
    console.log(`\n[SIMULATED EMAIL]`);
    console.log(`To: ${email}`);
    console.log(`Subject: SecureID - Email Verification OTP`);
    console.log(`OTP: ${otp}\n`);

    res.status(201).json({
      message: "Registration started. Please verify your email.",
      userId: user.id,
      challengeId: challenge.id,
      email: email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.sendEmailOTP = async (req, res) => {
  try {
    const { userId, purpose } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const user = db.findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const purposeType = purpose || "registration_email";
    const { challenge, otp } = otpService.createOTPChallenge(userId, purposeType, "email");
    console.log(`\n[SIMULATED EMAIL]`);
    console.log(`To: ${user.email}`);
    console.log(`Subject: SecureID - Your OTP Code`);
    console.log(`OTP: ${otp}\n`);

    res.json({
      message: "OTP sent to email",
      challengeId: challenge.id,
      maskedEmail: user.email.replace(/(.{2})(.*)(@.*)/, "$1***$3"),
    });
  } catch (err) {
    console.error("Send email OTP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.verifyEmailOTP = async (req, res) => {
  try {
    const { challengeId, otp } = req.body;
    if (!challengeId || !otp) {
      return res.status(400).json({ error: "Challenge ID and OTP are required" });
    }

    const result = otpService.verifyOTP(challengeId, otp);

    if (result.valid) {
      const challenge = db.getChallenge(challengeId);
      if (challenge) {
        db.updateUser(challenge.userId, { emailVerified: true });
      }
      return res.json({ message: "Email verified successfully", verified: true });
    }

    const response = { verified: false, error: result.reason };
    if (result.attemptsLeft !== undefined) {
      response.attemptsLeft = result.attemptsLeft;
    }
    res.status(400).json(response);
  } catch (err) {
    console.error("Verify email OTP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.sendSMSOTP = async (req, res) => {
  try {
    const { userId, purpose } = req.body;
    if (!userId) return res.status(400).json({ error: "User ID is required" });

    const user = db.findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const purposeType = purpose || "registration_sms";
    const { challenge, otp } = otpService.createOTPChallenge(userId, purposeType, "sms");
    console.log(`\n[SIMULATED SMS]`);
    console.log(`To: ${user.phone}`);
    console.log(`OTP: ${otp}`);
    console.log(`Message: Your SecureID verification code is: ${otp}`);
    console.log(`This code expires in 10 minutes.\n`);

    res.json({
      message: "OTP sent via SMS",
      challengeId: challenge.id,
      maskedPhone: user.phone.replace(/(\d{2})\d+(\d{2})/, "$1****$2"),
    });
  } catch (err) {
    console.error("Send SMS OTP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.verifySMSOTP = async (req, res) => {
  try {
    const { challengeId, otp } = req.body;
    if (!challengeId || !otp) {
      return res.status(400).json({ error: "Challenge ID and OTP are required" });
    }

    const result = otpService.verifyOTP(challengeId, otp);

    if (result.valid) {
      const challenge = db.getChallenge(challengeId);
      if (challenge) {
        db.updateUser(challenge.userId, {
          registered: true,
          mfaEnabled: true,
          mfaMethod: "sms",
        });
      }
      return res.json({ message: "SMS verified successfully", verified: true, mfaEnabled: true });
    }

    const response = { verified: false, error: result.reason };
    if (result.attemptsLeft !== undefined) {
      response.attemptsLeft = result.attemptsLeft;
    }
    res.status(400).json(response);
  } catch (err) {
    console.error("Verify SMS OTP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const lockInfo = db.getFailedLoginAttempts(email);
    if (lockInfo.lockedUntil && Date.now() < lockInfo.lockedUntil) {
      const remaining = Math.ceil((lockInfo.lockedUntil - Date.now()) / 60000);
      return res.status(423).json({
        error: "Account temporarily locked",
        lockedMinutes: remaining,
      });
    }

    const user = db.findUserByEmail(email);
    if (!user || !otpService.comparePassword(password, user.password)) {
      db.incrementFailedLogin(email);
      const remainingAttempts = 5 - db.getFailedLoginAttempts(email).count;
      return res.status(401).json({
        error: "Invalid email or password",
        attemptsLeft: Math.max(0, remainingAttempts),
      });
    }

    db.resetFailedLogins(email);

    if (!user.registered) {
      return res.status(403).json({ error: "Account not fully registered. Please complete registration." });
    }

    if (user.mfaEnabled) {
      const { challenge, otp } = otpService.createOTPChallenge(user.id, "login_mfa", user.mfaMethod);

      if (user.mfaMethod === "email") {
        console.log(`\n[SIMULATED EMAIL]`);
        console.log(`To: ${user.email}`);
        console.log(`Subject: SecureID - Login Verification`);
        console.log(`OTP: ${otp}\n`);
      } else if (user.mfaMethod === "sms") {
        console.log(`\n[SIMULATED SMS]`);
        console.log(`To: ${user.phone}`);
        console.log(`OTP: ${otp}`);
        console.log(`Message: Your SecureID login code is: ${otp}`);
        console.log(`This code expires in 10 minutes.\n`);
      }

      return res.json({
        mfaRequired: true,
        method: user.mfaMethod,
        challengeId: challenge.id,
        userId: user.id,
      });
    }

    const session = db.createSession(user.id, {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
    const accessToken = authService.generateAccessToken(user);
    const refreshToken = authService.generateRefreshToken(user);

    res.cookie("sessionId", session.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      message: "Login successful",
      user: { id: user.id, name: user.name, email: user.email },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.verifyLoginOTP = async (req, res) => {
  try {
    const { challengeId, otp } = req.body;
    if (!challengeId || !otp) {
      return res.status(400).json({ error: "Challenge ID and OTP are required" });
    }

    const challenge = db.getChallenge(challengeId);
    if (!challenge) {
      return res.status(400).json({ error: "Invalid challenge" });
    }

    const result = otpService.verifyOTP(challengeId, otp);

    if (result.valid) {
      const user = db.findUserById(challenge.userId);
      if (!user) return res.status(404).json({ error: "User not found" });

      const session = db.createSession(user.id, {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
      });
      const accessToken = authService.generateAccessToken(user);
      const refreshToken = authService.generateRefreshToken(user);

      res.cookie("sessionId", session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
      });

      return res.json({
        message: "MFA verification successful",
        user: { id: user.id, name: user.name, email: user.email },
        accessToken,
        refreshToken,
      });
    }

    const response = { verified: false, error: result.reason };
    if (result.attemptsLeft !== undefined) {
      response.attemptsLeft = result.attemptsLeft;
    }
    res.status(400).json(response);
  } catch (err) {
    console.error("Verify login OTP error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.me = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: "Not authenticated" });

    const fullUser = db.findUserById(user.userId);
    if (!fullUser) return res.status(404).json({ error: "User not found" });

    res.json({
      user: {
        id: fullUser.id,
        name: fullUser.name,
        email: fullUser.email,
        phone: fullUser.phone,
        mfaEnabled: fullUser.mfaEnabled,
        mfaMethod: fullUser.mfaMethod,
        emailVerified: fullUser.emailVerified,
      },
    });
  } catch (err) {
    console.error("Me error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.logout = async (req, res) => {
  try {
    const sessionId = req.cookies?.sessionId;
    if (sessionId) {
      db.deleteSession(sessionId);
    }
    res.clearCookie("sessionId");
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    let userId;

    const sessionId = req.cookies?.sessionId;
    if (sessionId) {
      const session = db.getSession(sessionId);
      if (session) userId = session.userId;
    }

    if (!userId && req.body.refreshToken) {
      const decoded = authService.verifyToken(req.body.refreshToken);
      if (decoded && decoded.type === "refresh") {
        userId = decoded.userId;
      }
    }

    if (!userId) {
      return res.status(401).json({ error: "Authentication required. Provide a session cookie or refresh token." });
    }

    const user = db.findUserById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const accessToken = authService.generateAccessToken(user);
    const refreshToken = authService.generateRefreshToken(user);

    res.json({ accessToken, refreshToken });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getProtected = async (req, res) => {
  res.json({ message: "Access to protected resource granted", user: req.user });
};
