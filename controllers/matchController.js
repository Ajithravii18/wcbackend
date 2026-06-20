const Match = require('../models/Match');

// @desc    Get all matches with computed timeState
// @route   GET /api/matches
// @access  Private
const getMatches = async (req, res) => {
  try {
    let matches = await Match.find().sort({ kickoffTime: 1 });

    // Handle live match state transitions
    const now = Date.now();
    const durationMs = 2 * 60 * 60 * 1000;
    
    let dbUpdated = false;
    for (let m of matches) {
      if (m.status !== 'completed' && now > m.kickoffTime.getTime() + durationMs) {
        m.status = 'completed';
        m.homeScore = 0;
        m.awayScore = 0;
        m.winner = 'Draw';
        await m.save();
        dbUpdated = true;
      } else if (m.status === 'upcoming' && now > m.kickoffTime.getTime() && now < m.kickoffTime.getTime() + durationMs) {
        m.status = 'live';
        await m.save();
        dbUpdated = true;
      }
    }

    if (dbUpdated) {
      matches = await Match.find().sort({ kickoffTime: 1 });
    }

    // toJSON() triggers virtuals (timeState)
    const matchesWithState = matches.map((m) => m.toJSON());

    res.json(matchesWithState);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get single match by ID
// @route   GET /api/matches/:id
// @access  Private
const getMatchById = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    res.json(match.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Update match result (admin action)
// @route   PUT /api/matches/:id/result
// @access  Private (no dedicated admin role in v1, available to any authenticated user)
const updateMatchResult = async (req, res) => {
  try {
    const { homeScore, awayScore, status } = req.body;

    let winner = null;
    if (homeScore !== undefined && awayScore !== undefined) {
      const match = await Match.findById(req.params.id);
      if (!match) return res.status(404).json({ message: 'Match not found' });

      if (homeScore > awayScore) winner = match.homeTeam;
      else if (awayScore > homeScore) winner = match.awayTeam;
      else winner = 'Draw';
    }

    const updateFields = {};
    if (homeScore !== undefined) updateFields.homeScore = homeScore;
    if (awayScore !== undefined) updateFields.awayScore = awayScore;
    if (status) updateFields.status = status;
    if (winner !== null) updateFields.winner = winner;

    // Explicitly use { returnDocument: 'after' } to prevent deprecation warnings
    const updated = await Match.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { returnDocument: 'after', new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'Match not found' });
    }

    // Evaluate predictions if match is completed
    if (status === 'completed' && homeScore !== undefined && awayScore !== undefined) {
      const Prediction = require('../models/Prediction');
      const Notification = require('../models/Notification');
      
      const predictions = await Prediction.find({ match: updated._id }).populate('user');
      
      for (const pred of predictions) {
        let points = 0;
        let isExact = false;

        if (pred.homeGoals === homeScore && pred.awayGoals === awayScore) {
          points = 3; // Exact match
          isExact = true;
        } else {
          // Correct outcome check
          const predictedOutcome = pred.homeGoals > pred.awayGoals ? 'home' : (pred.homeGoals < pred.awayGoals ? 'away' : 'draw');
          const actualOutcome = homeScore > awayScore ? 'home' : (homeScore < awayScore ? 'away' : 'draw');
          
          if (predictedOutcome === actualOutcome) {
            points = 1; // Correct outcome
          }
        }

        if (points > 0) {
          pred.points = points;
          await pred.save();

          if (isExact) {
            // Create notification
            await Notification.create({
              user: pred.user._id,
              message: `🎉 Congratulations! You predicted the exact score (${homeScore}-${awayScore}) for ${updated.homeTeam} vs ${updated.awayTeam}! You earned 3 points.`,
              type: 'prediction_correct'
            });
          }
        }
      }
    }

    res.json(updated.toJSON());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getMatches, getMatchById, updateMatchResult };
