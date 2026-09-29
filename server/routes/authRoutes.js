const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");
const router = express.Router();

const publicUser = (user) => ({ id: user._id, name: user.name, username: user.username, email: user.email, profilePicture: user.profilePicture, isOnline: user.isOnline, lastSeen: user.lastSeen });
const issueToken = (user) => jwt.sign({ sub: user._id.toString(), version: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "14d" });
async function assignUsername(user) {
  if (user.username) return;
  const normalized = user.name.toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  const base = normalized.length >= 3 ? normalized : `user${Math.floor(1000 + Math.random() * 9000)}`;
  let candidate = base;
  while (await User.exists({ username: candidate })) candidate = `${base.slice(0, 18)}${Math.floor(100 + Math.random() * 900)}`;
  user.username = candidate;
  await user.save();
}

router.post("/register", async (req, res, next) => {
  try {
    const { name, email, password, username } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ message: "Enter a name between 2 and 80 characters." });
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ message: "Enter a valid email address." });
    if (typeof password !== "string" || password.length < 8 || password.length > 72) return res.status(400).json({ message: "Password must be between 8 and 72 characters." });
    const normalized = (typeof username === "string" && username.trim() ? username : name).toLowerCase().trim().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    const base = normalized.length >= 3 ? normalized : `user${Math.floor(1000 + Math.random() * 9000)}`;
    const existing = await User.findOne({ email: email.trim().toLowerCase() });
    if (existing) return res.status(409).json({ message: "An account with this email already exists." });
    let candidate = base;
    while (await User.exists({ username: candidate })) candidate = `${base.slice(0, 18)}${Math.floor(100 + Math.random() * 900)}`;
    const user = await User.create({ name: name.trim(), username: candidate, email: email.trim().toLowerCase(), password: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "That email or username is already in use." });
    next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ message: "Email and password are required." });
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password +tokenVersion");
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: "Email or password is incorrect." });
    await assignUsername(user);
    res.json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) { next(error); }
});

router.get("/me", requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { $inc: { tokenVersion: 1 }, isOnline: false, lastSeen: new Date() });
    req.app.get("io")?.in(`user:${req.user.id}`).disconnectSockets(true);
    res.json({ success: true });
  } catch (error) { next(error); }
});

module.exports = router;
