const mongoose = require("mongoose");

const connectDB = async () => {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI must be configured.");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  console.log("MongoDB connected.");
};

module.exports = connectDB;
