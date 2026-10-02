const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ["direct", "group"], default: "direct", index: true },
  name: { type: String, trim: true, maxlength: 80, default: "" },
  groupPicture: { type: String, default: "" },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  admins: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
  participants: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], validate: { validator(v) { return this.type === "group" ? v.length >= 2 : v.length === 2; }, message: "A group needs at least two members." } },
  hiddenFor: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], default: [] },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });
conversationSchema.index({ participants: 1, updatedAt: -1 });
module.exports = mongoose.model("Conversation", conversationSchema);
