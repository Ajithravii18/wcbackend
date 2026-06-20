const express = require('express');
const router = express.Router();
const {
  submitPrediction,
  getMyPredictions,
  getGlobalPredictions,
} = require('../controllers/predictionController');
const { protect } = require('../middleware/auth');

router.post('/', protect, submitPrediction);
router.get('/my', protect, getMyPredictions);
router.get('/global', protect, getGlobalPredictions);

module.exports = router;
