const Prediction = require('../models/Prediction');
const Match = require('../models/Match');

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

/**
 * Validates whether the current server time falls within the
 * 5-hour prediction window for the given match kickoff time.
 *
 * Window: [kickoffTime - 5h, kickoffTime)
 *
 * Returns an object { valid: boolean, message: string }
 */
const validateTimeWindow = (kickoffTime) => {
  const now = Date.now();
  const kickoff = new Date(kickoffTime).getTime();
  const windowOpen = kickoff - FIVE_HOURS_MS;

  if (now < windowOpen) {
    const opensIn = Math.ceil((windowOpen - now) / (60 * 1000));
    const hours = Math.floor(opensIn / 60);
    const minutes = opensIn % 60;
    return {
      valid: false,
      message: `Prediction window not yet open. Opens in ${hours}h ${minutes}m (5 hours before kickoff).`,
    };
  }

  if (now >= kickoff) {
    return {
      valid: false,
      message: 'The match has already started. Predictions are now locked.',
    };
  }

  return { valid: true, message: 'Prediction window is open.' };
};

// @desc    Submit or update a prediction (upsert)
// @route   POST /api/predictions
// @access  Private
const submitPrediction = async (req, res) => {
  try {
    const { matchId, homeGoals, awayGoals } = req.body;

    if (!matchId || homeGoals === undefined || awayGoals === undefined) {
      return res
        .status(400)
        .json({ message: 'matchId, homeGoals, and awayGoals are required' });
    }

    if (homeGoals < 0 || awayGoals < 0) {
      return res.status(400).json({ message: 'Goals cannot be negative' });
    }

    // Fetch the match to check time state
    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    // Block editing if prediction already exists
    const existingPrediction = await Prediction.findOne({ user: req.user._id, match: matchId });
    if (existingPrediction) {
      return res.status(403).json({ message: 'You have already submitted a prediction for this match. Edits are disabled.' });
    }

    // Rigorous 5-hour time window validation
    const timeCheck = validateTimeWindow(match.kickoffTime);
    if (!timeCheck.valid) {
      return res.status(403).json({ message: timeCheck.message });
    }

    // Upsert prediction — one per user per match
    // Explicitly use { returnDocument: 'after' } to prevent Mongoose deprecation warnings
    const prediction = await Prediction.findOneAndUpdate(
      { user: req.user._id, match: matchId },
      {
        $set: {
          homeGoals: parseInt(homeGoals, 10),
          awayGoals: parseInt(awayGoals, 10),
          submittedAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: 'after',
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    res.status(200).json(prediction);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get current user's predictions (joined with match data)
// @route   GET /api/predictions/my
// @access  Private
const getMyPredictions = async (req, res) => {
  try {
    const predictions = await Prediction.find({ user: req.user._id })
      .populate('match')
      .sort({ createdAt: -1 });

    // Attach timeState to each match in the response
    const enriched = predictions.map((p) => {
      const predObj = p.toObject();
      if (predObj.match) {
        const matchDoc = p.match; // still a Mongoose doc
        predObj.match = matchDoc.toJSON(); // triggers virtual timeState
      }
      return predObj;
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get all users' predictions (global feed, joined with match + user)
// @route   GET /api/predictions/global
// @access  Private
const getGlobalPredictions = async (req, res) => {
  try {
    const predictions = await Prediction.find()
      .populate('match')
      .populate('user', 'name email avatar')
      .sort({ submittedAt: -1 })
      .limit(2000); // cap for performance

    const enriched = predictions.map((p) => {
      const predObj = p.toObject();
      if (predObj.match) {
        const matchDoc = p.match;
        predObj.match = matchDoc.toJSON(); // triggers virtual timeState
      }
      return predObj;
    });

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { submitPrediction, getMyPredictions, getGlobalPredictions };
