const speakeasy = require("speakeasy");
const QRCode = require("qrcode");

function generateSecret(email) {
  const secret = speakeasy.generateSecret({
    name: `SecureID (${email})`,
    issuer: "SecureID",
    length: 20,
  });
  return { base32: secret.base32, otpauthUrl: secret.otpauth_url };
}

async function generateQRCode(otpauthUrl) {
  try {
    return await QRCode.toDataURL(otpauthUrl);
  } catch {
    return null;
  }
}

function verifyToken(secret, token) {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2,
  });
}

module.exports = { generateSecret, generateQRCode, verifyToken };
