const Comment = require('../models/Comment');
const Match = require('../models/Match');

// @desc    Get comments for a match
// @route   GET /api/matches/:id/comments
// @access  Private
const getComments = async (req, res) => {
  try {
    const comments = await Comment.find({ match: req.params.id })
      .populate('user', 'name avatar')
      .sort({ createdAt: -1 });
    res.json(comments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Post a comment for a match
// @route   POST /api/matches/:id/comments
// @access  Private
const postComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.trim() === '') {
      return res.status(400).json({ message: 'Comment text is required' });
    }

    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const existingComment = await Comment.findOne({
      match: match._id,
      user: req.user._id
    });

    if (existingComment) {
      return res.status(400).json({ message: 'You have already commented on this match' });
    }

    const comment = await Comment.create({
      match: match._id,
      user: req.user._id,
      text: text.trim()
    });

    const populatedComment = await Comment.findById(comment._id).populate('user', 'name avatar');
    res.status(201).json(populatedComment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getComments, postComment };
