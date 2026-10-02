const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, ".env") });
if (!process.env.MONGO_URI && process.env.MONGODB_URI) process.env.MONGO_URI = process.env.MONGODB_URI;

const http = require("http");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { Server } = require("socket.io");
const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const chatRoutes = require("./routes/chatRoutes");
const profileRoutes = require("./routes/profileRoutes");
const mediaRoutes = require("./routes/mediaRoutes");
const User = require("./models/User");
const Conversation = require("./models/Conversation");
const Message = require("./models/Message");

const missingEnvironment = ["MONGO_URI", "JWT_SECRET"].filter((name) => !process.env[name]);
if (missingEnvironment.length) {
  throw new Error(`Missing required environment variable(s): ${missingEnvironment.join(", ")}. Configure server/.env.`);
}

const app = express();
const server = http.createServer(app);
const allowedOrigins = [...new Set([
  "http://localhost:5173",
  "http://192.168.31.81:5173",
  "https://alpha-chat-9kxx.vercel.app",
  "https://alpha-chat-9kxx-4dfof6hv8-prince-f1e5.vercel.app",
  ...(process.env.CLIENT_URL || "").split(",").map((v) => v.trim()).filter(Boolean),
])];
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json({ limit: "16kb" }));
app.use("/api/auth", authRoutes);
app.use("/", mediaRoutes);
app.use("/api", chatRoutes);
app.use("/api", profileRoutes);
app.get("/", (_req, res) => res.send("alphaChat API is running."));
app.use((_req, res) => res.status(404).json({ message: "Not found." }));
app.use((error, _req, res, _next) => {
  if (error.name === "ValidationError") return res.status(400).json({ message: "Please check the information and try again." });
  console.error(error);
  res.status(500).json({ message: "Something went wrong. Please try again." });
});

const io = new Server(server, {
  cors: { origin: allowedOrigins, credentials: true, methods: ["GET", "POST"] },
  transports: ["websocket", "polling"],
});
app.set("io", io);
const activeSockets = new Map();

io.use(async (socket, next) => {
  console.info("[socket] connection attempt", { socketId: socket.id, origin: socket.handshake.headers.origin });
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      console.warn("[socket] authentication failed: token missing", { socketId: socket.id });
      return next(new Error("Authentication required: token missing"));
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select("+tokenVersion");
    if (!user || (payload.version || 0) !== user.tokenVersion) {
      console.warn("[socket] authentication failed: user or session not found", { socketId: socket.id });
      return next(new Error("Invalid session"));
    }
    socket.userId = user.id;
    console.info("[socket] authenticated", { socketId: socket.id, userId: user.id });
    next();
  } catch (error) {
    const message = error.name === "TokenExpiredError" ? "Session expired. Please log in again." : "Invalid session";
    console.warn("[socket] authentication failed", { socketId: socket.id, reason: message });
    next(new Error(message));
  }
});

io.on("connection", async (socket) => {
  const userId = socket.userId;
  const userRoom = `user:${userId}`;
  const count = activeSockets.get(userId) || 0;
  activeSockets.set(userId, count + 1);
  socket.join(userRoom);
  console.info("[socket] user joined room", { socketId: socket.id, userId, room: userRoom });
  if (!count) {
    await User.findByIdAndUpdate(userId, { isOnline: true });
    socket.broadcast.emit("user_online", { userId });
  }

  socket.on("send_message", async (data = {}, acknowledge = () => {}) => {
    try {
      const content = typeof data.content === "string" ? data.content.trim() : "";
      if (!content || content.length > 4000) return acknowledge({ error: "Messages must be between 1 and 4,000 characters." });
      if (!mongoose.isValidObjectId(data.conversationId)) return acknowledge({ error: "Conversation not found." });
      const conversation = await Conversation.findOne({ _id: data.conversationId, participants: userId });
      if (!conversation) return acknowledge({ error: "Conversation not found." });
      const receiver = conversation.participants.find((id) => id.toString() !== userId);
      const message = await Message.create({ conversation: conversation._id, sender: userId, receiver, content });
      conversation.lastMessage = message._id;
      conversation.lastMessageAt = message.createdAt;
      await conversation.save();
      const payload = { ...message.toObject(), clientId: typeof data.clientId === "string" ? data.clientId : undefined };
      io.to(userRoom).emit("receive_message", payload);
      io.to(`user:${receiver}`).emit("receive_message", payload);
      acknowledge({ message: payload });
    } catch (error) {
      console.error("send_message failed", error);
      acknowledge({ error: "Message could not be sent. Please try again." });
    }
  });

  socket.on("edit_message", async (data = {}, acknowledge = () => {}) => {
    try {
      if (!mongoose.isValidObjectId(data.messageId)) return acknowledge({ error: "Message not found." });
      const content = typeof data.content === "string" ? data.content.trim() : "";
      if (!content || content.length > 4000) return acknowledge({ error: "Messages must be between 1 and 4,000 characters." });
      const message = await Message.findById(data.messageId);
      if (!message || message.sender.toString() !== userId) return acknowledge({ error: "You can only edit your own messages." });
      if (message.isDeleted) return acknowledge({ error: "This message was deleted." });
      const conversation = await Conversation.findOne({ _id: message.conversation, participants: userId }).select("_id");
      if (!conversation) return acknowledge({ error: "Conversation not found." });
      message.content = content;
      message.editedAt = new Date();
      await message.save();
      const payload = message.toObject();
      io.to(`user:${message.sender}`).emit("message_updated", payload);
      io.to(`user:${message.receiver}`).emit("message_updated", payload);
      acknowledge({ message: payload });
    } catch (error) {
      console.error("edit_message failed", error);
      acknowledge({ error: "Message could not be edited. Please try again." });
    }
  });

  socket.on("delete_message", async (data = {}, acknowledge = () => {}) => {
    try {
      if (!mongoose.isValidObjectId(data.messageId)) return acknowledge({ error: "Message not found." });
      const message = await Message.findById(data.messageId);
      if (!message || message.sender.toString() !== userId) return acknowledge({ error: "You can only delete your own messages." });
      if (message.isDeleted) return acknowledge({ error: "This message was already deleted." });
      const conversation = await Conversation.findOne({ _id: message.conversation, participants: userId }).select("_id");
      if (!conversation) return acknowledge({ error: "Conversation not found." });
      message.content = "This message was deleted";
      message.isDeleted = true;
      message.deletedAt = new Date();
      await message.save();
      const payload = message.toObject();
      io.to(`user:${message.sender}`).emit("message_deleted", payload);
      io.to(`user:${message.receiver}`).emit("message_deleted", payload);
      acknowledge({ message: payload });
    } catch (error) {
      console.error("delete_message failed", error);
      acknowledge({ error: "Message could not be deleted. Please try again." });
    }
  });

  for (const event of ["typing_start", "typing_stop"]) {
    socket.on(event, async ({ conversationId } = {}) => {
      try {
        if (!mongoose.isValidObjectId(conversationId)) return;
        const conversation = await Conversation.findOne({ _id: conversationId, participants: userId }).select("participants");
        if (!conversation) return;
        const receiver = conversation.participants.find((id) => id.toString() !== userId);
        io.to(`user:${receiver}`).emit(event, { conversationId, userId });
      } catch (error) { console.error(`${event} failed`, error); }
    });
  }

  socket.on("disconnect", async () => {
    console.info("[socket] disconnected", { socketId: socket.id, userId });
    const remaining = (activeSockets.get(userId) || 1) - 1;
    if (remaining > 0) return activeSockets.set(userId, remaining);
    activeSockets.delete(userId);
    const lastSeen = new Date();
    await User.findByIdAndUpdate(userId, { isOnline: false, lastSeen });
    io.emit("user_offline", { userId, lastSeen });
  });
});

const port = process.env.PORT || 5000;
async function startServer() {
  console.log("Connecting to MongoDB...");
  await connectDB();
  server.listen(port, "0.0.0.0", () => console.log(`Server running on port ${port} (0.0.0.0)`));
}

startServer().catch((error) => {
  console.error("Server startup failed:", error);
  process.exitCode = 1;
});
