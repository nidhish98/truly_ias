const { verifyToken } = require("../services/authService");
const db = require("../database/db");

function authenticateSession(req, res, next) {
  const sessionId = req.cookies?.sessionId;
  if (!sessionId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const session = db.getSession(sessionId);
  if (!session) {
    return res.status(401).json({ error: "Invalid session" });
  }
  const user = db.findUserById(session.userId);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  req.user = {
    userId: user.id,
    email: user.email,
    name: user.name,
    sessionId,
  };
  next();
}

function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Access token required" });
  }
  const token = authHeader.split(" ")[1];
  const decoded = verifyToken(token);
  if (!decoded || decoded.type !== "access") {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  req.user = decoded;
  next();
}

module.exports = { authenticateSession, authenticateJWT };
