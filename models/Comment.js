const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      maxlength: [500, 'Comment cannot exceed 500 characters'],
    },
  },
  { timestamps: true }
);

// Index to quickly fetch comments for a match
commentSchema.index({ match: 1, createdAt: -1 });

module.exports = mongoose.model('Comment', commentSchema);
