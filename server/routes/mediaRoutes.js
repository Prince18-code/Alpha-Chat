const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();
router.get("/media/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).end();
    const id = new mongoose.mongo.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "profilePictures" });
    const [file] = await bucket.find({ _id: id }).toArray();
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.contentType)) return res.status(404).end();
    res.set({
      "Content-Type": file.contentType,
      "Content-Length": file.length,
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });
    bucket.openDownloadStream(id).on("error", next).pipe(res);
  } catch (error) { next(error); }
});

module.exports = router;
