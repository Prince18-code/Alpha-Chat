const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  username: { type: String, trim: true, lowercase: true, unique: true, sparse: true, minlength: 3, maxlength: 24 },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  password: { type: String, required: true, select: false },
  googleId: { type: String, sparse: true, unique: true },
  profilePicture: { type: String, default: "" },
  isOnline: { type: Boolean, default: false },
  lastSeen: { type: Date, default: Date.now },
  tokenVersion: { type: Number, default: 0, select: false },
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
