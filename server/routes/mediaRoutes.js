const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();
const supportedTypes = ["image/jpeg", "image/png", "image/webp"];

function imageTypeFromHeader(buffer) {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "";
}

router.get("/media/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    const id = new mongoose.mongo.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "profilePictures" });
    const [file] = await bucket.find({ _id: id }).toArray();
    if (!file) return res.status(404).end();
    let contentType = file.metadata?.contentType || file.contentType;
    if (!supportedTypes.includes(contentType)) {
      const headerChunks = [];
      for await (const chunk of bucket.openDownloadStream(id, { end: 12 })) headerChunks.push(chunk);
      contentType = imageTypeFromHeader(Buffer.concat(headerChunks));
    }
    if (!supportedTypes.includes(contentType)) return res.status(404).end();
    res.set({
      "Content-Type": contentType,
      "Content-Length": file.length,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });
    bucket.openDownloadStream(id).on("error", next).pipe(res);
  } catch (error) { next(error); }
});

module.exports = router;
