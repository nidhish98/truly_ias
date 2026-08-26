const users = require("../lib/users");
const mfa = require("../lib/mfa");
const { json } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
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
  } catch (err) {
    console.error("Verify MFA error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
