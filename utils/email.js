const nodemailer = require('nodemailer');

/**
 * Create a reusable transporter.
 * Uses Gmail by default. Set EMAIL_USER and EMAIL_PASS in .env
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use an App Password, not your real Gmail password
    },
  });
};

/**
 * Generate a random 6-digit OTP string
 */
const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Send an OTP email for registration or password change
 */
const sendOtpEmail = async ({ to, otp, purpose }) => {
  const transporter = createTransporter();

  const isRegister = purpose === 'register';
  const isForgot = purpose === 'forgot-password';

  const subject = isRegister
    ? '🏆 LUCKY STAR FC — Verify Your Account'
    : isForgot
    ? '🔑 LUCKY STAR FC — Reset Your Password'
    : '🔐 LUCKY STAR FC — Password Change OTP';

  const actionLabel = isRegister
    ? 'complete your registration'
    : isForgot
    ? 'reset your password'
    : 'change your password';

  const titleLabel = isRegister
    ? 'Confirm your email address'
    : isForgot
    ? 'Reset your password'
    : 'Confirm your password change';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <style>
        body { margin: 0; padding: 0; background: #050810; font-family: 'Helvetica Neue', Arial, sans-serif; }
        .wrapper { max-width: 480px; margin: 40px auto; background: #0B0F19; border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; overflow: hidden; }
        .header { background: linear-gradient(135deg, #050810 0%, #0d1530 100%); padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .logo { font-size: 22px; font-weight: 900; letter-spacing: 0.3em; color: #ffffff; text-transform: uppercase; margin: 0; }
        .sub { font-size: 10px; letter-spacing: 0.35em; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-top: 6px; }
        .body { padding: 36px 32px; text-align: center; }
        .title { font-size: 14px; font-weight: 700; letter-spacing: 0.15em; color: rgba(255,255,255,0.7); text-transform: uppercase; margin-bottom: 28px; }
        .otp-box { display: inline-block; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 24px 48px; margin-bottom: 28px; }
        .otp { font-size: 48px; font-weight: 900; letter-spacing: 0.25em; color: #10b981; margin: 0; font-family: monospace; }
        .note { font-size: 12px; color: rgba(255,255,255,0.35); letter-spacing: 0.05em; line-height: 1.6; }
        .footer { padding: 20px 32px; border-top: 1px solid rgba(255,255,255,0.06); text-align: center; font-size: 11px; color: rgba(255,255,255,0.2); letter-spacing: 0.08em; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <p class="logo">LUCKY STAR FC</p>
          <p class="sub">Prediction Corner · World Cup 2026</p>
        </div>
        <div class="body">
          <p class="title">${titleLabel}</p>
          <div class="otp-box">
            <p class="otp">${otp}</p>
          </div>
          <p class="note">
            Enter this code in the app to ${actionLabel}.<br/>
            This code expires in <strong style="color:rgba(255,255,255,0.6)">10 minutes</strong>.<br/>
            If you didn't request this, ignore this email.
          </p>
        </div>
        <div class="footer">LUCKY STAR FC © 2026 · All rights reserved</div>
      </div>
    </body>
    </html>
  `;

  await transporter.sendMail({
    from: `"LUCKY STAR FC" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
};

module.exports = { generateOtp, sendOtpEmail };
