const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const requireAuth = require("../middleware/auth");
const router = express.Router();
router.use(requireAuth);

router.get("/users", async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    if (query.length < 2) return res.json({ users: [] });
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const users = await User.find({ _id: { $ne: req.user._id }, $or: [{ name: new RegExp(escaped, "i") }, { username: new RegExp(escaped, "i") }] }).select("name username profilePicture isOnline lastSeen").limit(12).lean();
    res.json({ users });
  } catch (error) { next(error); }
});

router.get("/conversations", async (req, res, next) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id }).sort({ lastMessageAt: -1 }).populate("participants", "name username profilePicture isOnline lastSeen").populate({ path: "lastMessage", select: "content sender createdAt editedAt isDeleted" }).lean();
    res.json({ conversations });
  } catch (error) { next(error); }
});

router.post("/conversations/:userId", async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId) || userId === req.user.id) return res.status(400).json({ message: "Choose a valid person to chat with." });
    const other = await User.findById(userId).select("_id name username profilePicture isOnline lastSeen");
    if (!other) return res.status(404).json({ message: "User not found." });
    let conversation = await Conversation.findOne({ participants: { $all: [req.user._id, other._id], $size: 2 } });
    if (!conversation) conversation = await Conversation.create({ participants: [req.user._id, other._id] });
    conversation = await Conversation.findById(conversation._id).populate("participants", "name username profilePicture isOnline lastSeen").populate("lastMessage", "content sender createdAt editedAt isDeleted").lean();
    res.status(200).json({ conversation });
  } catch (error) { next(error); }
});

router.get("/conversations/:conversationId/messages", async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Invalid conversation." });
    const conversation = await Conversation.findOne({ _id: conversationId, participants: req.user._id }).select("_id");
    if (!conversation) return res.status(404).json({ message: "Conversation not found." });
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 40, 1), 100);
    const filter = { conversation: conversation._id };
    if (req.query.before && mongoose.isValidObjectId(req.query.before)) filter._id = { $lt: req.query.before };
    const messages = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const hasMore = messages.length > limit;
    messages.length = Math.min(messages.length, limit);
    res.json({ messages: messages.reverse(), hasMore });
  } catch (error) { next(error); }
});

module.exports = router;
