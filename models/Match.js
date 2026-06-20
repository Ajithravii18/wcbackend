const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    homeTeam: {
      type: String,
      required: [true, 'Home team is required'],
      trim: true,
    },
    homeFlag: {
      type: String,
      default: '🏳️',
    },
    awayTeam: {
      type: String,
      required: [true, 'Away team is required'],
      trim: true,
    },
    awayFlag: {
      type: String,
      default: '🏳️',
    },
    venue: {
      type: String,
      trim: true,
      default: 'TBD',
    },
    kickoffTime: {
      type: Date,
      required: [true, 'Kickoff time is required'],
    },
    status: {
      type: String,
      enum: ['upcoming', 'live', 'completed'],
      default: 'upcoming',
    },
    homeScore: {
      type: Number,
      default: null,
    },
    awayScore: {
      type: Number,
      default: null,
    },
    winner: {
      type: String,
      default: null,
    },
    apiVerified: {
      type: Boolean,
      default: false,
    },
    group: {
      type: String,
      default: 'Group Stage',
    },
    matchday: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

/**
 * Virtual: computes the time state of this match relative to now.
 * - 'early'  : now < kickoffTime - 5h  → predictions not yet open
 * - 'open'   : kickoffTime - 5h ≤ now < kickoffTime → predictions open
 * - 'locked' : now ≥ kickoffTime → match started, predictions locked
 */
matchSchema.virtual('timeState').get(function () {
  const now = Date.now();
  const kickoff = this.kickoffTime.getTime();
  const fiveHoursMs = 5 * 60 * 60 * 1000;
  const windowOpen = kickoff - fiveHoursMs;

  if (now < windowOpen) return 'early';
  if (now >= windowOpen && now < kickoff) return 'open';
  return 'locked';
});

// Include virtuals when converting to JSON
matchSchema.set('toJSON', { virtuals: true });
matchSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Match', matchSchema);
