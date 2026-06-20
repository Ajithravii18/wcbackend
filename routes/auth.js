const express = require('express');
const router = express.Router();
const {
  sendRegisterOtp,
  verifyRegisterOtp,
  login,
  getMe,
  sendChangePasswordOtp,
  verifyChangePasswordOtp,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');

// Registration with OTP
router.post('/register/send-otp', sendRegisterOtp);
router.post('/register/verify-otp', verifyRegisterOtp);

// Login
router.post('/login', login);

// Get current user
router.get('/me', protect, getMe);

// Change password with OTP (protected)
router.post('/change-password/send-otp', protect, sendChangePasswordOtp);
router.post('/change-password/verify-otp', protect, verifyChangePasswordOtp);

// Forgot password (public — no auth needed)
router.post('/forgot-password/send-otp', sendForgotPasswordOtp);
router.post('/forgot-password/verify-otp', verifyForgotPasswordOtp);

module.exports = router;
