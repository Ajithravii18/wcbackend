const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  otp: {
    type: String,
    required: true,
  },
  purpose: {
    type: String,
    enum: ['register', 'change-password', 'forgot-password'],
    required: true,
  },
  // Pending user data for registration (stored before OTP verified)
  pendingUser: {
    name: String,
    password: String, // already hashed
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600, // Auto-delete after 10 minutes (MongoDB TTL index)
  },
});

module.exports = mongoose.model('Otp', otpSchema);
