const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    match: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },
    homeGoals: {
      type: Number,
      required: true,
      min: [0, 'Goals cannot be negative'],
      max: [20, 'Goals cannot exceed 20'],
      default: 0,
    },
    awayGoals: {
      type: Number,
      required: true,
      min: [0, 'Goals cannot be negative'],
      max: [20, 'Goals cannot exceed 20'],
      default: 0,
    },
    points: {
      type: Number,
      default: 0,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

// Enforce one prediction per user per match
predictionSchema.index({ user: 1, match: 1 }, { unique: true });

module.exports = mongoose.model('Prediction', predictionSchema);
