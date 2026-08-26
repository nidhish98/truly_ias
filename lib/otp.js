const bcrypt = require("bcryptjs");
const redis = require("./redis");

const OTP_EXPIRY = 600;
const MAX_ATTEMPTS = 5;

function generateOTP() {
  let otp = "";
  for (let i = 0; i < 6; i++) {
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

async function createChallenge(userId, purpose, method) {
  const id = require("uuid").v4();
  const otp = generateOTP();
  const otpHash = hashOTP(otp);
  const challenge = {
    id,
    userId,
    purpose,
    method,
    otpHash,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    verified: false,
    createdAt: Date.now(),
    expiresAt: Date.now() + OTP_EXPIRY * 1000,
  };
  await redis.set(`challenge:${id}`, JSON.stringify(challenge), { ex: OTP_EXPIRY });
  return { challenge, otp };
}

async function getChallenge(id) {
  const data = await redis.get(`challenge:${id}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function updateChallenge(id, updates) {
  const ch = await getChallenge(id);
  if (!ch) return null;
  Object.assign(ch, updates);
  await redis.set(`challenge:${id}`, JSON.stringify(ch), { ex: OTP_EXPIRY });
  return ch;
}

async function deleteChallenge(id) {
  await redis.del(`challenge:${id}`);
}

async function verifyOTP(challengeId, otp) {
  const challenge = await getChallenge(challengeId);
  if (!challenge) return { valid: false, reason: "Invalid challenge" };
  if (challenge.verified) return { valid: false, reason: "Challenge already used" };
  if (Date.now() > challenge.expiresAt) return { valid: false, reason: "expired" };
  if (challenge.attempts >= challenge.maxAttempts) return { valid: false, reason: "max_attempts" };

  await updateChallenge(challengeId, { attempts: challenge.attempts + 1 });

  if (!verifyOTPHash(otp, challenge.otpHash)) {
    const remaining = challenge.maxAttempts - (challenge.attempts + 1);
    return { valid: false, reason: "wrong", attemptsLeft: remaining };
  }

  await updateChallenge(challengeId, { verified: true });
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
    { label: "At least one special character", test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
  ];
  return requirements.map((r) => ({ ...r, met: r.test(password) }));
}

module.exports = {
  generateOTP,
  createChallenge,
  getChallenge,
  updateChallenge,
  deleteChallenge,
  verifyOTP,
  hashPassword,
  comparePassword,
  validatePasswordStrength,
};
