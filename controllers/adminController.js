const User = require('../models/User');
const Prediction = require('../models/Prediction');

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Toggle user freeze status
// @route   PUT /api/admin/users/:id/freeze
// @access  Private/Admin
const toggleFreezeUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot freeze another admin' });
    }

    user.isFrozen = !user.isFrozen;
    await user.save();

    res.json({
      message: `User ${user.isFrozen ? 'frozen' : 'unfrozen'} successfully`,
      isFrozen: user.isFrozen,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Delete user and their predictions
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'admin') {
      return res.status(400).json({ message: 'Cannot delete another admin' });
    }

    // Delete all predictions made by this user
    await Prediction.deleteMany({ user: user._id });

    // Delete all comments made by this user
    const Comment = require('../models/Comment');
    await Comment.deleteMany({ user: user._id });

    // Delete the user
    await user.deleteOne();

    res.json({ message: 'User, predictions, and comments deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Force evaluate all completed matches
// @route   PUT /api/admin/evaluate
// @access  Private/Admin
const evaluateAllMatches = async (req, res) => {
  try {
    const Match = require('../models/Match');
    const matches = await Match.find({ status: 'completed' });
    let count = 0;

    for (const match of matches) {
      const predictions = await Prediction.find({ match: match._id });
      for (const pred of predictions) {
        if (pred.points > 0) continue; // Already calculated

        let points = 0;
        if (pred.homeGoals === match.homeScore && pred.awayGoals === match.awayScore) {
          points = 3;
        } else {
          const predictedOutcome = pred.homeGoals > pred.awayGoals ? 'home' : (pred.homeGoals < pred.awayGoals ? 'away' : 'draw');
          const actualOutcome = match.homeScore > match.awayScore ? 'home' : (match.homeScore < match.awayScore ? 'away' : 'draw');
          if (predictedOutcome === actualOutcome) points = 1;
        }

        if (points > 0) {
          pred.points = points;
          await pred.save();
          count++;
        }
      }
    }

    res.json({ message: `Successfully evaluated matches. Awarded points to ${count} new predictions.` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  getAllUsers,
  toggleFreezeUser,
  deleteUser,
  evaluateAllMatches
};
