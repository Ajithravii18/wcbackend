const express = require('express');
const router = express.Router({ mergeParams: true });
const { getComments, postComment } = require('../controllers/commentController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/', getComments);
router.post('/', postComment);

module.exports = router;
