const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  participants: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], validate: (v) => v.length === 2 },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });
conversationSchema.index({ participants: 1, updatedAt: -1 });
module.exports = mongoose.model("Conversation", conversationSchema);
