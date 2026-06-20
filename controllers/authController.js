const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Otp = require('../models/Otp');
const { generateOtp, sendOtpEmail } = require('../utils/email');

// Generate a signed JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

// @desc    Step 1 of registration — send OTP to email
// @route   POST /api/auth/register/send-otp
// @access  Public
const sendRegisterOtp = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please provide name, email, and password' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered' });
    }

    // Hash password now so we can store it safely in OTP doc
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    const otp = generateOtp();

    // Remove any existing OTPs for this email/purpose
    await Otp.deleteMany({ email, purpose: 'register' });

    // Save OTP record with pending user data
    await Otp.create({
      email,
      otp,
      purpose: 'register',
      pendingUser: { name, password: hashedPassword },
    });

    await sendOtpEmail({ to: email, otp, purpose: 'register' });

    res.json({ message: 'OTP sent to your email. Valid for 10 minutes.' });
  } catch (err) {
    console.error('sendRegisterOtp error:', err);
    res.status(500).json({ message: 'Failed to send OTP. Check email config.' });
  }
};

// @desc    Step 2 of registration — verify OTP and create account
// @route   POST /api/auth/register/verify-otp
// @access  Public
const verifyRegisterOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const record = await Otp.findOne({ email, purpose: 'register' });

    if (!record) {
      return res.status(400).json({ message: 'OTP expired or not found. Please request a new one.' });
    }

    if (record.otp !== otp.trim()) {
      return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });
    }

    // OTP is valid — create the user using pre-hashed password
    // We bypass the pre-save hook by using save() with a flag
    const user = new User({
      name: record.pendingUser.name,
      email,
      password: record.pendingUser.password,
    });

    // Skip re-hashing (password already hashed)
    user.$locals = { skipHash: true };
    await user.save();

    // Clean up OTP
    await Otp.deleteMany({ email, purpose: 'register' });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      isFrozen: user.isFrozen,
      token: generateToken(user._id),
    });
  } catch (err) {
    console.error('verifyRegisterOtp error:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (user.isFrozen) {
      return res.status(403).json({ message: 'Your account has been frozen by an administrator.' });
    }

    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      role: user.role,
      isFrozen: user.isFrozen,
      token: generateToken(user._id),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  res.json({
    _id: req.user._id,
    name: req.user.name,
    email: req.user.email,
    avatar: req.user.avatar,
    role: req.user.role,
    isFrozen: req.user.isFrozen,
    createdAt: req.user.createdAt,
  });
};

// @desc    Step 1 of change-password — send OTP
// @route   POST /api/auth/change-password/send-otp
// @access  Private
const sendChangePasswordOtp = async (req, res) => {
  try {
    const email = req.user.email;
    const otp = generateOtp();

    await Otp.deleteMany({ email, purpose: 'change-password' });
    await Otp.create({ email, otp, purpose: 'change-password' });
    await sendOtpEmail({ to: email, otp, purpose: 'change-password' });

    res.json({ message: 'OTP sent to your registered email.' });
  } catch (err) {
    console.error('sendChangePasswordOtp error:', err);
    res.status(500).json({ message: 'Failed to send OTP. Check email config.' });
  }
};

// @desc    Step 2 of change-password — verify OTP and update password
// @route   POST /api/auth/change-password/verify-otp
// @access  Private
const verifyChangePasswordOtp = async (req, res) => {
  try {
    const { otp, newPassword } = req.body;
    const email = req.user.email;

    if (!otp || !newPassword) {
      return res.status(400).json({ message: 'OTP and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const record = await Otp.findOne({ email, purpose: 'change-password' });
    if (!record) {
      return res.status(400).json({ message: 'OTP expired or not found. Please request a new one.' });
    }

    if (record.otp !== otp.trim()) {
      return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });
    }

    const user = await User.findById(req.user._id);
    user.password = newPassword;
    await user.save(); // triggers the pre-save hash

    await Otp.deleteMany({ email, purpose: 'change-password' });

    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('verifyChangePasswordOtp error:', err);
    res.status(500).json({ message: err.message });
  }
};

// @desc    Step 1 of forgot-password — send OTP (public, no auth needed)
// @route   POST /api/auth/forgot-password/send-otp
// @access  Public
const sendForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const user = await User.findOne({ email });
    if (!user) {
      // Don't reveal whether email exists
      return res.json({ message: 'If that email exists, an OTP has been sent.' });
    }

    const otp = generateOtp();
    await Otp.deleteMany({ email, purpose: 'forgot-password' });
    await Otp.create({ email, otp, purpose: 'forgot-password' });
    await sendOtpEmail({ to: email, otp, purpose: 'forgot-password' });

    res.json({ message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('sendForgotPasswordOtp error:', err);
    res.status(500).json({ message: 'Failed to send OTP. Check email config.' });
  }
};

// @desc    Step 2 of forgot-password — verify OTP and reset password
// @route   POST /api/auth/forgot-password/verify-otp
// @access  Public
const verifyForgotPasswordOtp = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: 'Email, OTP and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const record = await Otp.findOne({ email, purpose: 'forgot-password' });
    if (!record) {
      return res.status(400).json({ message: 'OTP expired or not found. Please request a new one.' });
    }
    if (record.otp !== otp.trim()) {
      return res.status(400).json({ message: 'Incorrect OTP. Please try again.' });
    }

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.password = newPassword;
    await user.save(); // triggers bcrypt hash

    await Otp.deleteMany({ email, purpose: 'forgot-password' });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('verifyForgotPasswordOtp error:', err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  sendRegisterOtp,
  verifyRegisterOtp,
  login,
  getMe,
  sendChangePasswordOtp,
  verifyChangePasswordOtp,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
};
