const redis = require("./redis");
const { v4: uuidv4 } = require("uuid");

async function createUser(data) {
  const id = uuidv4();
  const user = { id, ...data, createdAt: new Date().toISOString() };
  await redis.set(`user:${id}`, JSON.stringify(user));
  await redis.set(`user:email:${data.email}`, id);
  await redis.set(`user:phone:${data.phone}`, id);
  return user;
}

async function findUserById(id) {
  const data = await redis.get(`user:${id}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function findUserByEmail(email) {
  const id = await redis.get(`user:email:${email}`);
  if (!id) return null;
  return findUserById(id);
}

async function findUserByPhone(phone) {
  const id = await redis.get(`user:phone:${phone}`);
  if (!id) return null;
  return findUserById(id);
}

async function updateUser(id, updates) {
  const user = await findUserById(id);
  if (!user) return null;
  Object.assign(user, updates);
  await redis.set(`user:${id}`, JSON.stringify(user));
  return user;
}

async function createSession(userId, data = {}) {
  const id = uuidv4();
  const session = { id, userId, ...data, createdAt: Date.now() };
  await redis.set(`session:${id}`, JSON.stringify(session), { ex: 86400 });
  return session;
}

async function getSession(id) {
  const data = await redis.get(`session:${id}`);
  if (!data) return null;
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function deleteSession(id) {
  await redis.del(`session:${id}`);
}

async function getFailedLogins(email) {
  const data = await redis.get(`failed:${email}`);
  if (!data) return { count: 0, lockedUntil: null };
  return typeof data === "string" ? JSON.parse(data) : data;
}

async function incrementFailedLogins(email) {
  const record = (await getFailedLogins(email)) || { count: 0, lockedUntil: null };
  record.count += 1;
  if (record.count >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000;
  }
  await redis.set(`failed:${email}`, JSON.stringify(record), { ex: 900 });
  return record;
}

async function resetFailedLogins(email) {
  await redis.del(`failed:${email}`);
}

module.exports = {
  createUser,
  findUserById,
  findUserByEmail,
  findUserByPhone,
  updateUser,
  createSession,
  getSession,
  deleteSession,
  getFailedLogins,
  incrementFailedLogins,
  resetFailedLogins,
};
