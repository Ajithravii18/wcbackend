const express = require('express');
const router = express.Router();
const { getMatches, getMatchById, updateMatchResult } = require('../controllers/matchController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getMatches);
router.get('/:id', protect, getMatchById);
router.put('/:id/result', protect, updateMatchResult);

module.exports = router;
