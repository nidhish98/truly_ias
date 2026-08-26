const cookie = require("cookie");

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return cookie.parse(header);
}

function setCookie(res, name, value, options = {}) {
  const existing = res.getHeader("Set-Cookie") || [];
  const cookies = Array.isArray(existing) ? existing : existing ? [existing] : [];
  cookies.push(cookie.serialize(name, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: options.maxAge || 86400,
    path: "/",
    ...options,
  }));
  res.setHeader("Set-Cookie", cookies);
}

function clearCookie(res, name) {
  setCookie(res, name, "", { maxAge: 0 });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function json(res, status, data) {
  cors(res);
  res.status(status).json(data);
}

module.exports = { parseCookies, setCookie, clearCookie, cors, json };
