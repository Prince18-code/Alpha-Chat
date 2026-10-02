const User = require("../models/User");

async function ensureUsername(user) {
  if (user.username) return user.username;

  const normalized = user.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  const base = normalized.length >= 3 ? normalized : `user${Math.floor(1000 + Math.random() * 9000)}`;
  let candidate = base;
  while (await User.exists({ username: candidate })) {
    candidate = `${base.slice(0, 18)}${Math.floor(100 + Math.random() * 900)}`;
  }
  user.username = candidate;
  await user.save();
  return candidate;
}

async function ensureUsernamesForIds(ids) {
  const users = await User.find({ _id: { $in: ids } }).select("name username");
  await Promise.all(users.map(ensureUsername));
  return new Map(users.map((user) => [user.id, user.username]));
}

module.exports = { ensureUsername, ensureUsernamesForIds };
