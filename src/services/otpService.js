const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../database/db");

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function generateOTP() {
  let otp = "";
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += Math.floor(Math.random() * 10).toString();
  }
  return otp;
}

function hashOTP(otp) {
  return bcrypt.hashSync(otp, 10);
}

function verifyOTPHash(otp, hash) {
  return bcrypt.compareSync(otp, hash);
}

function createOTPChallenge(userId, purpose, method) {
  const existingChallenges = [];
  for (const [, ch] of db.challenges || []) {
    if (ch.userId === userId && ch.purpose === purpose && ch.method === method && !ch.verified) {
      existingChallenges.push(ch.id);
    }
  }
  existingChallenges.forEach((id) => db.deleteChallenge(id));

  const otp = generateOTP();
  const otpHash = hashOTP(otp);

  const challenge = db.createChallenge({
    userId,
    purpose,
    method,
    otpHash,
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    maxAttempts: MAX_ATTEMPTS,
    verified: false,
  });

  return { challenge, otp };
}

function verifyOTP(challengeId, otp) {
  const challenge = db.getChallenge(challengeId);
  if (!challenge) {
    return { valid: false, reason: "Invalid challenge" };
  }
  if (challenge.verified) {
    return { valid: false, reason: "Challenge already used" };
  }
  if (Date.now() > challenge.expiresAt) {
    return { valid: false, reason: "expired" };
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    return { valid: false, reason: "max_attempts" };
  }

  db.updateChallenge(challengeId, { attempts: challenge.attempts + 1 });

  if (!verifyOTPHash(otp, challenge.otpHash)) {
    const remaining = challenge.maxAttempts - (challenge.attempts + 1);
    return { valid: false, reason: "wrong", attemptsLeft: remaining };
  }

  db.updateChallenge(challengeId, { verified: true });
  return { valid: true };
}

function hashPassword(password) {
  return bcrypt.hashSync(password, 12);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

function validatePasswordStrength(password) {
  const requirements = [
    { label: "At least 8 characters", test: (p) => p.length >= 8 },
    { label: "At least one uppercase letter", test: (p) => /[A-Z]/.test(p) },
    { label: "At least one lowercase letter", test: (p) => /[a-z]/.test(p) },
    { label: "At least one number", test: (p) => /\d/.test(p) },
    { label: "At least one special character", test: (p) => /[!@#$%^&*(),.?\":{}|<>]/.test(p) },
  ];
  return requirements.map((r) => ({ ...r, met: r.test(password) }));
}

module.exports = {
  generateOTP,
  createOTPChallenge,
  verifyOTP,
  hashPassword,
  comparePassword,
  validatePasswordStrength,
};
