const express = require('express');
const router = express.Router();
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

const otpStore = new Map();
const rateLimitStore = new Map();

const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 5;
const OTP_EXPIRE_MS = 2 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 3;

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Rate limiter middleware
const rateLimiter = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  let clientData = rateLimitStore.get(clientIp);
  if (!clientData || now > clientData.resetTime) {
    clientData = { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  }
  clientData.count++;
  rateLimitStore.set(clientIp, clientData);
  if (clientData.count > RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((clientData.resetTime - now) / 1000);
    return res.status(429).json({
      success: false,
      message: `Çok fazla istek. ${Math.ceil(retryAfter / 60)} dakika sonra tekrar deneyin.`,
      retryAfter,
    });
  }
  next();
};

// Send code
router.post('/send-code', rateLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ success: false, message: 'Geçerli bir e-posta adresi girin' });
  }
  try {
    const code = generateOTP();
    const hashedCode = await bcrypt.hash(code, 10);
    const expireTime = Date.now() + OTP_EXPIRE_MS;
    otpStore.set(email, { hashedCode, expireTime, attempts: 0 });
    
    const mailOptions = {
      from: `"Aytaç Yavuzel" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'E-posta Doğrulama Kodu',
      html: `<div style="font-family: Arial; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #E4380D;">E-posta Doğrulama</h2>
        <p>Hesabınızı oluşturmak için aşağıdaki doğrulama kodunu kullanın:</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #E4380D; border-radius: 8px; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #666;">Bu kod <strong>2 dakika</strong> boyunca geçerlidir.</p>
        <p style="color: #999; font-size: 12px;">Aytaç Yavuzel - Mali Müşavir</p>
      </div>`,
    };
    
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Doğrulama kodu e-posta adresinize gönderildi', expiresIn: 120 });
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({ success: false, message: 'E-posta gönderilemedi. Lütfen tekrar deneyin.' });
  }
});

// Verify code
const verifyOtpHandler = async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ success: false, message: 'E-posta ve kod gereklidir' });
  }
  const otpData = otpStore.get(email);
  if (!otpData) {
    return res.status(404).json({ success: false, message: 'Doğrulama kodu bulunamadı. Lütfen yeni kod gönderin.' });
  }
  if (Date.now() > otpData.expireTime) {
    otpStore.delete(email);
    return res.status(410).json({ success: false, message: 'Kodun süresi doldu. Lütfen yeni kod gönderin.' });
  }
  if (otpData.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(email);
    return res.status(429).json({ success: false, message: 'Çok fazla hatalı deneme. Lütfen yeni kod gönderin.' });
  }
  const isValid = await bcrypt.compare(code, otpData.hashedCode);
  if (isValid) {
    otpStore.delete(email);
    return res.json({ success: true, message: 'E-posta doğrulandı' });
  } else {
    otpData.attempts++;
    otpStore.set(email, otpData);
    const remainingAttempts = MAX_VERIFY_ATTEMPTS - otpData.attempts;
    return res.status(400).json({
      success: false,
      message: `Hatalı kod. ${remainingAttempts} deneme hakkınız kaldı.`,
      remainingAttempts,
    });
  }
};

router.post('/verify-otp', verifyOtpHandler);
router.post('/verify-code', verifyOtpHandler);

module.exports = router;
