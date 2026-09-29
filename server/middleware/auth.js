const jwt = require("jsonwebtoken");
const User = require("../models/User");

async function requireAuth(req, res, next) {
  const token = req.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ message: "Authentication required." });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select("name username email profilePicture isOnline lastSeen +tokenVersion");
    if (!user || (payload.version || 0) !== user.tokenVersion) return res.status(401).json({ message: "Session is no longer valid." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: "Session is no longer valid." });
  }
}

module.exports = requireAuth;
