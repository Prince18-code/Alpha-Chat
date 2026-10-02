const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const requireAuth = require("../middleware/auth");
const { ensureUsername, ensureUsernamesForIds } = require("../utils/ensureUsername");
const multer = require("multer");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const router = express.Router();
router.use(requireAuth);

const groupUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 }, fileFilter: (_req, file, callback) => {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) return callback(new Error("Choose a JPG, PNG, or WebP image."));
  callback(null, true);
} });
const groupBucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "profilePictures" });
const imageType = (buffer) => {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
};
const groupForMember = (id, userId) => Conversation.findOne({ _id: id, type: "group", participants: userId });
const emitConversationUpdate = (io, conversation) => conversation.participants.forEach((id) => io?.to(`user:${id}`).emit("conversation_updated", { conversationId: conversation.id }));

router.get("/users", async (req, res, next) => {
  try {
    const query = String(req.query.q || "").trim();
    if (query.length < 2) return res.json({ users: [] });
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const usernameQuery = query.replace(/^@/, "");
    const usernameEscaped = usernameQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const exactUsernameMatch = usernameQuery ? await User.findOne({
      _id: { $ne: req.user._id },
      username: usernameQuery.toLowerCase(),
    }).select("name username profilePicture isOnline lastSeen") : null;
    const usernameMatches = usernameQuery ? await User.find({
      _id: { $ne: req.user._id },
      username: new RegExp(usernameEscaped, "i"),
      ...(exactUsernameMatch ? { _id: { $nin: [req.user._id, exactUsernameMatch._id] } } : {}),
    }).select("name username profilePicture isOnline lastSeen").sort({ username: 1 }).limit(exactUsernameMatch ? 11 : 12) : [];
    const prioritizedUsers = [...(exactUsernameMatch ? [exactUsernameMatch] : []), ...usernameMatches];
    const remaining = 12 - prioritizedUsers.length;
    const nameMatches = remaining ? await User.find({
      _id: { $nin: [req.user._id, ...prioritizedUsers.map((user) => user._id)] },
      name: new RegExp(escaped, "i"),
    }).select("name username profilePicture isOnline lastSeen").limit(remaining) : [];
    const users = [...prioritizedUsers, ...nameMatches];
    await Promise.all(users.map(ensureUsername));
    res.json({ users: users.map((user) => user.toObject()) });
  } catch (error) { next(error); }
});

router.get("/conversations", async (req, res, next) => {
  try {
    let conversations = await Conversation.find({ participants: req.user._id, hiddenFor: { $ne: req.user._id } }).sort({ lastMessageAt: -1 }).populate("participants", "name username profilePicture isOnline lastSeen").populate({ path: "lastMessage", select: "content sender createdAt editedAt isDeleted" }).lean();
    const missingUsernameIds = conversations.flatMap((conversation) => conversation.participants.filter((person) => !person.username).map((person) => person._id));
    if (missingUsernameIds.length) {
      const usernames = await ensureUsernamesForIds(missingUsernameIds);
      conversations = conversations.map((conversation) => ({
        ...conversation,
        participants: conversation.participants.map((person) => ({ ...person, username: person.username || usernames.get(String(person._id)) })),
      }));
    }
    res.json({ conversations });
  } catch (error) { next(error); }
});

router.post("/conversations/:userId", async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId) || userId === req.user.id) return res.status(400).json({ message: "Choose a valid person to chat with." });
    const other = await User.findById(userId).select("_id name username profilePicture isOnline lastSeen");
    if (!other) return res.status(404).json({ message: "User not found." });
    await ensureUsername(other);
    let conversation = await Conversation.findOne({ participants: { $all: [req.user._id, other._id], $size: 2 }, $or: [{ type: "direct" }, { type: { $exists: false } }] });
    if (!conversation) conversation = await Conversation.create({ participants: [req.user._id, other._id] });
    await Conversation.updateOne({ _id: conversation._id }, { $pull: { hiddenFor: { $in: [req.user._id, other._id] } } });
    conversation = await Conversation.findById(conversation._id).populate("participants", "name username profilePicture isOnline lastSeen").populate("lastMessage", "content sender createdAt editedAt isDeleted").lean();
    res.status(200).json({ conversation });
  } catch (error) { next(error); }
});

router.post("/groups", async (req, res, next) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const memberIds = [...new Set([req.user.id, ...(Array.isArray(req.body?.memberIds) ? req.body.memberIds : [])].map(String))];
    if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Group name must be between 2 and 80 characters." });
    if (memberIds.length < 2 || memberIds.length > 100 || memberIds.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: "Choose between 1 and 99 valid members." });
    const users = await User.find({ _id: { $in: memberIds } }).select("_id name username");
    if (users.length !== memberIds.length) return res.status(400).json({ message: "One or more selected users could not be found." });
    await Promise.all(users.map(ensureUsername));
    const conversation = await Conversation.create({ type: "group", name, participants: memberIds, admins: [req.user._id], createdBy: req.user._id });
    const populated = await Conversation.findById(conversation._id).populate("participants", "name username profilePicture isOnline lastSeen").lean();
    res.status(201).json({ conversation: populated });
  } catch (error) { next(error); }
});

router.patch("/groups/:conversationId", async (req, res, next) => {
  try {
    const conversation = await groupForMember(req.params.conversationId, req.user._id);
    if (!conversation) return res.status(404).json({ message: "Group not found." });
    if (!conversation.admins.some((id) => id.equals(req.user._id))) return res.status(403).json({ message: "Only group admins can change group settings." });
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    if (name.length < 2 || name.length > 80) return res.status(400).json({ message: "Group name must be between 2 and 80 characters." });
    conversation.name = name;
    await conversation.save();
    emitConversationUpdate(req.app.get("io"), conversation);
    res.json({ success: true, name });
  } catch (error) { next(error); }
});

router.post("/groups/:conversationId/members", async (req, res, next) => {
  try {
    const conversation = await groupForMember(req.params.conversationId, req.user._id);
    if (!conversation) return res.status(404).json({ message: "Group not found." });
    if (!conversation.admins.some((id) => id.equals(req.user._id))) return res.status(403).json({ message: "Only group admins can add members." });
    const ids = [...new Set((Array.isArray(req.body?.memberIds) ? req.body.memberIds : []).map(String))].filter((id) => !conversation.participants.some((participant) => participant.toString() === id));
    if (!ids.length || ids.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ message: "Choose at least one valid member." });
    if (conversation.participants.length + ids.length > 100) return res.status(400).json({ message: "Groups can have up to 100 members." });
    const users = await User.find({ _id: { $in: ids } }).select("_id username name");
    if (users.length !== ids.length) return res.status(400).json({ message: "One or more selected users could not be found." });
    await Promise.all(users.map(ensureUsername));
    conversation.participants.push(...users.map((item) => item._id));
    conversation.hiddenFor.pull(...users.map((item) => item._id));
    await conversation.save();
    emitConversationUpdate(req.app.get("io"), conversation);
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.delete("/groups/:conversationId/members/:userId", async (req, res, next) => {
  try {
    const conversation = await groupForMember(req.params.conversationId, req.user._id);
    if (!conversation || !mongoose.isValidObjectId(req.params.userId)) return res.status(404).json({ message: "Group member not found." });
    const removingSelf = req.params.userId === req.user.id;
    const isAdmin = conversation.admins.some((id) => id.equals(req.user._id));
    if (!removingSelf && !isAdmin) return res.status(403).json({ message: "Only group admins can remove members." });
    const memberId = new mongoose.Types.ObjectId(req.params.userId);
    if (!conversation.participants.some((id) => id.equals(memberId))) return res.status(404).json({ message: "Group member not found." });
    const originalMembers = conversation.participants.map((id) => id.toString());
    conversation.participants.pull(memberId);
    conversation.admins.pull(memberId);
    const groupDeleted = conversation.participants.length < 2;
    if (groupDeleted) {
      await Conversation.deleteOne({ _id: conversation._id });
      originalMembers.forEach((id) => req.app.get("io")?.to(`user:${id}`).emit("group_removed", { conversationId: conversation.id }));
    }
    else {
      if (!conversation.admins.length) conversation.admins.push(conversation.participants[0]);
      await conversation.save();
    }
    if (!groupDeleted) {
      req.app.get("io")?.to(`user:${memberId}`).emit("group_removed", { conversationId: conversation.id });
      emitConversationUpdate(req.app.get("io"), conversation);
    }
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.post("/groups/:conversationId/picture", async (req, res, next) => {
  groupUpload.single("image")(req, res, async (uploadError) => {
    if (uploadError) return res.status(uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ message: uploadError.code === "LIMIT_FILE_SIZE" ? "Group pictures must be 2 MB or smaller." : uploadError.message });
    let newId;
    try {
      const conversation = await groupForMember(req.params.conversationId, req.user._id);
      if (!conversation) return res.status(404).json({ message: "Group not found." });
      if (!conversation.admins.some((id) => id.equals(req.user._id))) return res.status(403).json({ message: "Only group admins can change the group picture." });
      if (!req.file) return res.status(400).json({ message: "Choose an image to upload." });
      const type = imageType(req.file.buffer);
      if (!type || type !== req.file.mimetype) return res.status(400).json({ message: "The selected file is not a supported image." });
      const stream = groupBucket().openUploadStream(`group-${conversation.id}`, { metadata: { conversationId: conversation.id, contentType: type } });
      await pipeline(Readable.from(req.file.buffer), stream);
      newId = stream.id;
      const oldId = conversation.groupPicture.match(/^\/media\/([a-f\d]{24})$/i)?.[1];
      conversation.groupPicture = `/media/${newId.toString()}`;
      await conversation.save();
      if (oldId) await groupBucket().delete(new mongoose.Types.ObjectId(oldId)).catch(() => {});
      emitConversationUpdate(req.app.get("io"), conversation);
      res.json({ groupPicture: conversation.groupPicture });
    } catch (error) {
      if (newId) await groupBucket().delete(newId).catch(() => {});
      next(error);
    }
  });
});

router.delete("/conversations/:conversationId", async (req, res, next) => {
  try {
    const conversation = await Conversation.findOneAndUpdate({ _id: req.params.conversationId, participants: req.user._id }, { $addToSet: { hiddenFor: req.user._id } }, { new: true }).select("_id");
    if (!conversation) return res.status(404).json({ message: "Conversation not found." });
    res.json({ success: true });
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
