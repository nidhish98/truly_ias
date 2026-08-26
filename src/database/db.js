const users = new Map();
const challenges = new Map();
const sessions = new Map();
const failedLogins = new Map();

function findUserByEmail(email) {
  for (const [, user] of users) {
    if (user.email === email) return user;
  }
  return null;
}

function findUserByPhone(phone) {
  for (const [, user] of users) {
    if (user.phone === phone) return user;
  }
  return null;
}

function findUserById(id) {
  return users.get(id) || null;
}

function createUser(userData) {
  const id = require("uuid").v4();
  const user = { id, ...userData, createdAt: new Date().toISOString() };
  users.set(id, user);
  return user;
}

function updateUser(id, updates) {
  const user = users.get(id);
  if (!user) return null;
  Object.assign(user, updates);
  return user;
}

function createChallenge(challengeData) {
  const id = require("uuid").v4();
  const challenge = {
    id,
    ...challengeData,
    attempts: 0,
    createdAt: Date.now(),
  };
  challenges.set(id, challenge);
  return challenge;
}

function getChallenge(id) {
  return challenges.get(id) || null;
}

function updateChallenge(id, updates) {
  const ch = challenges.get(id);
  if (!ch) return null;
  Object.assign(ch, updates);
  return ch;
}

function deleteChallenge(id) {
  challenges.delete(id);
}

function createSession(userId, data = {}) {
  const id = require("uuid").v4();
  const session = { id, userId, ...data, createdAt: Date.now() };
  sessions.set(id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id) || null;
}

function deleteSession(id) {
  sessions.delete(id);
}

function getFailedLoginAttempts(email) {
  const record = failedLogins.get(email);
  if (!record) return { count: 0, lockedUntil: null };
  return record;
}

function incrementFailedLogin(email) {
  const record = failedLogins.get(email) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000;
  }
  failedLogins.set(email, record);
  return record;
}

function resetFailedLogins(email) {
  failedLogins.delete(email);
}

module.exports = {
  findUserByEmail,
  findUserByPhone,
  findUserById,
  createUser,
  updateUser,
  createChallenge,
  getChallenge,
  updateChallenge,
  deleteChallenge,
  createSession,
  getSession,
  deleteSession,
  getFailedLoginAttempts,
  incrementFailedLogin,
  resetFailedLogins,
};
