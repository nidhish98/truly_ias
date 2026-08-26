const auth = require("../lib/auth");
const { json } = require("../lib/helpers");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 200, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer "))
      return json(res, 401, { error: "Access token required" });

    const token = header.split(" ")[1];
    const decoded = auth.verifyToken(token);
    if (!decoded || decoded.type !== "access")
      return json(res, 401, { error: "Invalid or expired token" });

    return json(res, 200, { message: "Access to protected resource granted", user: decoded });
  } catch (err) {
    console.error("Protected error:", err);
    return json(res, 500, { error: "Internal server error" });
  }
};
