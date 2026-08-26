const users = require("../lib/users");
const auth = require("../lib/auth");
const { json, parseCookies } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
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

    return json(res, 200, {
      accessToken: auth.generateAccessToken(user),
      refreshToken: auth.generateRefreshToken(user),
    });
  } catch (err) {
    console.error("Token error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
