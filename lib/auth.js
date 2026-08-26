const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "secureid-jwt-secret-change-in-vercel-env";
const JWT_EXPIRY = "15m";
const REFRESH_EXPIRY = "7d";

function generateAccessToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, type: "access" }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function generateRefreshToken(user) {
  return jwt.sign({ userId: user.id, email: user.email, type: "refresh" }, JWT_SECRET, { expiresIn: REFRESH_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

module.exports = { generateAccessToken, generateRefreshToken, verifyToken };
