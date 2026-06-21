const express = require('express');
const router = express.Router();
const { getAllUsers, toggleFreezeUser, deleteUser, evaluateAllMatches } = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

router.use(protect, admin);

router.route('/users')
  .get(getAllUsers);

router.route('/users/:id/freeze')
  .put(toggleFreezeUser);

router.route('/users/:id')
  .delete(deleteUser);

router.route('/evaluate')
  .put(evaluateAllMatches);

module.exports = router;
