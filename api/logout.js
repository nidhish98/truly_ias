const users = require("../lib/users");
const { json, parseCookies, clearCookie } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const cookies = parseCookies(req);
    if (cookies.sessionId) await users.deleteSession(cookies.sessionId);
    clearCookie(res, "sessionId");
    return json(res, 200, { message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
