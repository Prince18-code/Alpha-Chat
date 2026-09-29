const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const User = require("../models/User");
const requireAuth = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

const publicProfile = (user) => ({
  id: user._id,
  name: user.name,
  username: user.username,
  profilePicture: user.profilePicture || "",
  isOnline: user.isOnline,
  lastSeen: user.lastSeen,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(new Error("Choose a JPG, PNG, or WebP image."));
    }
    callback(null, true);
  },
});

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "profilePictures" });
const mediaIdFromPath = (path) => path?.match(/^\/media\/([a-f\d]{24})$/i)?.[1];
const deleteMedia = async (id) => {
  if (!mongoose.isValidObjectId(id)) return;
  try { await bucket().delete(new mongoose.mongo.ObjectId(id)); } catch (error) {
    if (error.code !== "ENOENT") console.error("profile picture cleanup failed", error);
  }
};

function actualImageType(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}

function parseImage(req, res, next) {
  upload.single("image")(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ message: "Profile pictures must be 2 MB or smaller." });
    }
    res.status(400).json({ message: error.message || "The image could not be uploaded." });
  });
}

router.get("/users/:userId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: "Profile not found." });
    const user = await User.findById(req.params.userId).select("name username profilePicture isOnline lastSeen").lean();
    if (!user) return res.status(404).json({ message: "Profile not found." });
    res.json({ user: publicProfile(user) });
  } catch (error) { next(error); }
});

router.put("/users/me/profile", async (req, res, next) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Display name must be between 2 and 80 characters." });
    if (!/^[a-z0-9_]{3,24}$/.test(username)) return res.status(400).json({ message: "Username must be 3–24 characters using letters, numbers, and underscores." });
    const user = await User.findById(req.user._id).select("name username profilePicture isOnline lastSeen");
    if (!user) return res.status(404).json({ message: "Profile not found." });
    user.name = name;
    user.username = username;
    await user.save();
    const profile = publicProfile(user);
    req.app.get("io")?.emit("user_profile_updated", profile);
    res.json({ user: profile });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "That username is already in use." });
    next(error);
  }
});

router.post("/users/me/profile-picture", parseImage, async (req, res, next) => {
  let newId;
  try {
    if (!req.file) return res.status(400).json({ message: "Choose an image to upload." });
    const detectedType = actualImageType(req.file.buffer);
    if (!detectedType || detectedType !== req.file.mimetype) return res.status(400).json({ message: "The selected file is not a supported image." });
    const fileBucket = bucket();
    const stream = fileBucket.openUploadStream(`profile-${req.user._id}`, {
      contentType: detectedType,
      metadata: { ownerId: req.user._id.toString() },
    });
    await pipeline(Readable.from(req.file.buffer), stream);
    newId = stream.id;
    const user = await User.findById(req.user._id).select("name username profilePicture isOnline lastSeen");
    if (!user) {
      await deleteMedia(newId);
      return res.status(404).json({ message: "Profile not found." });
    }
    const oldId = mediaIdFromPath(user.profilePicture);
    user.profilePicture = `/media/${newId.toString()}`;
    await user.save();
    if (oldId) await deleteMedia(oldId);
    const profile = publicProfile(user);
    req.app.get("io")?.emit("user_profile_updated", profile);
    res.json({ user: profile });
  } catch (error) {
    if (newId) await deleteMedia(newId);
    next(error);
  }
});

router.delete("/users/me/profile-picture", async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select("name username profilePicture isOnline lastSeen");
    if (!user) return res.status(404).json({ message: "Profile not found." });
    const oldId = mediaIdFromPath(user.profilePicture);
    user.profilePicture = "";
    await user.save();
    if (oldId) await deleteMedia(oldId);
    const profile = publicProfile(user);
    req.app.get("io")?.emit("user_profile_updated", profile);
    res.json({ user: profile });
  } catch (error) { next(error); }
});

module.exports = router;
