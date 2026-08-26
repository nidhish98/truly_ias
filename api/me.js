const users = require("../lib/users");
const auth = require("../lib/auth");
const { json, parseCookies } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    const cookies = parseCookies(req);
    const sessionId = cookies.sessionId;
    if (!sessionId) return json(res, 401, { error: "Not authenticated" });

    const session = await users.getSession(sessionId);
    if (!session) return json(res, 401, { error: "Invalid session" });

    const user = await users.findUserById(session.userId);
    if (!user) return json(res, 404, { error: "User not found" });

    return json(res, 200, {
      user: {
        id: user.id, name: user.name, email: user.email, phone: user.phone,
        mfaEnabled: user.mfaEnabled, mfaMethod: user.mfaMethod, emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error("Me error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
