const Prediction = require('../models/Prediction');

// @desc    Get global leaderboard
// @route   GET /api/leaderboard
// @access  Private
const getLeaderboard = async (req, res) => {
  try {
    const leaderboard = await Prediction.aggregate([
      {
        $group: {
          _id: '$user',
          points: { $sum: '$points' },
          totalPredictions: { $sum: 1 },
          correctPredictions: { 
            $sum: { $cond: [{ $gt: ['$points', 0] }, 1, 0] } 
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 1,
          name: '$user.name',
          points: 1,
          totalPredictions: 1,
          correctPredictions: 1
        }
      },
      {
        $sort: { points: -1, correctPredictions: -1, totalPredictions: 1 }
      }
    ]);

    res.json(leaderboard);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getLeaderboard };
