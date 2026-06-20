const express = require('express');
const router = express.Router();
const { getAllUsers, toggleFreezeUser, deleteUser } = require('../controllers/adminController');
const { protect, admin } = require('../middleware/auth');

router.use(protect, admin);

router.route('/users')
  .get(getAllUsers);

router.route('/users/:id/freeze')
  .put(toggleFreezeUser);

router.route('/users/:id')
  .delete(deleteUser);

module.exports = router;
