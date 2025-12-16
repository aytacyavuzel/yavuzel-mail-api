// ═══════════════════════════════════════════════════════════════════════════
// 📧 MAIL API SERVER - OTP WITH VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════
// Version: 3.0 - Secure OTP Flow
// Features:
// - Rate Limiting (5 requests / 15 minutes per IP)
// - OTP Storage with Hash (bcrypt)
// - OTP Expiry (2 minutes)
// - Verification Endpoint
// - Cleanup old OTPs
// ═══════════════════════════════════════════════════════════════════════════

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY STORAGE
// ═══════════════════════════════════════════════════════════════════════════

// Rate Limiting Store: { ip: { count, resetTime } }
const rateLimitStore = new Map();

// OTP Store: { email: { hashedCode, expireTime, attempts } }
const otpStore = new Map();

// Constants
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5; // 5 requests per window
const OTP_EXPIRE_MS = 2 * 60 * 1000; // 2 minutes
const OTP_LENGTH = 6;
const MAX_VERIFY_ATTEMPTS = 3;

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

const rateLimiter = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  let clientData = rateLimitStore.get(clientIp);
  
  // Initialize or reset if window expired
  if (!clientData || now > clientData.resetTime) {
    clientData = {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
  }
  
  // Increment request count
  clientData.count++;
  rateLimitStore.set(clientIp, clientData);
  
  // Check limit
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

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP OLD RECORDS (Probabilistic)
// ═══════════════════════════════════════════════════════════════════════════

const cleanupStores = () => {
  const now = Date.now();
  
  // Clean rate limit store
  for (const [ip, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(ip);
    }
  }
  
  // Clean OTP store
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expireTime) {
      otpStore.delete(email);
    }
  }
};

// Run cleanup every 5 minutes
setInterval(cleanupStores, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TRANSPORTER (Hostinger SMTP)
// ═══════════════════════════════════════════════════════════════════════════

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: 'info@aytacyavuzel.com',
    pass: 'Ay123456!',
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: GENERATE OTP
// ═══════════════════════════════════════════════════════════════════════════

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: SEND OTP (POST /send-code)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/send-code', rateLimiter, async (req, res) => {
  const { email } = req.body;
  
  // Validate email
  if (!email || !email.includes('@')) {
    return res.status(400).json({
      success: false,
      message: 'Geçerli bir e-posta adresi girin',
    });
  }
  
  try {
    // Generate OTP
    const code = generateOTP();
    
    // Hash OTP (bcrypt with salt rounds 10)
    const hashedCode = await bcrypt.hash(code, 10);
    
    // Store OTP with expiry
    const expireTime = Date.now() + OTP_EXPIRE_MS;
    otpStore.set(email, {
      hashedCode,
      expireTime,
      attempts: 0,
    });
    
    // Email content
    const mailOptions = {
      from: '"Aytaç Yavuzel" <info@aytacyavuzel.com>',
      to: email,
      subject: 'E-posta Doğrulama Kodu',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #E4380D;">E-posta Doğrulama</h2>
          <p>Merhaba,</p>
          <p>Hesabınızı oluşturmak için aşağıdaki doğrulama kodunu kullanın:</p>
          <div style="background: #f5f5f5; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #E4380D; border-radius: 8px; margin: 20px 0;">
            ${code}
          </div>
          <p style="color: #666;">Bu kod <strong>2 dakika</strong> boyunca geçerlidir.</p>
          <p style="color: #999; font-size: 12px;">Bu kodu kimseyle paylaşmayın. Eğer bu işlemi siz yapmadıysanız, bu e-postayı görmezden gelebilirsiniz.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #999; font-size: 12px;">Aytaç Yavuzel - Mali Müşavir</p>
        </div>
      `,
    };
    
    // Send email
    await transporter.sendMail(mailOptions);
    
    // Probabilistic cleanup (10% chance)
    if (Math.random() < 0.1) {
      cleanupStores();
    }
    
    // IMPORTANT: DO NOT SEND CODE TO CLIENT!
    res.json({
      success: true,
      message: 'Doğrulama kodu e-posta adresinize gönderildi',
      expiresIn: 120, // seconds (for UI countdown)
    });
    
  } catch (error) {
    console.error('Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'E-posta gönderilemedi. Lütfen tekrar deneyin.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: VERIFY OTP (POST /verify-otp)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/verify-otp', async (req, res) => {
  const { email, code } = req.body;
  
  // Validate inputs
  if (!email || !code) {
    return res.status(400).json({
      success: false,
      message: 'E-posta ve kod gereklidir',
    });
  }
  
  // Check if OTP exists
  const otpData = otpStore.get(email);
  
  if (!otpData) {
    return res.status(404).json({
      success: false,
      message: 'Doğrulama kodu bulunamadı. Lütfen yeni kod gönderin.',
    });
  }
  
  // Check expiry
  if (Date.now() > otpData.expireTime) {
    otpStore.delete(email);
    return res.status(410).json({
      success: false,
      message: 'Kodun süresi doldu. Lütfen yeni kod gönderin.',
    });
  }
  
  // Check attempts
  if (otpData.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(email);
    return res.status(429).json({
      success: false,
      message: 'Çok fazla hatalı deneme. Lütfen yeni kod gönderin.',
    });
  }
  
  // Verify code (compare with hash)
  const isValid = await bcrypt.compare(code, otpData.hashedCode);
  
  if (isValid) {
    // SUCCESS - Delete OTP
    otpStore.delete(email);
    
    return res.json({
      success: true,
      message: 'E-posta doğrulandı',
    });
  } else {
    // FAILED - Increment attempts
    otpData.attempts++;
    otpStore.set(email, otpData);
    
    const remainingAttempts = MAX_VERIFY_ATTEMPTS - otpData.attempts;
    
    return res.status(400).json({
      success: false,
      message: `Hatalı kod. ${remainingAttempts} deneme hakkınız kaldı.`,
      remainingAttempts,
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    version: '3.0',
    features: [
      'Rate Limiting',
      'OTP Hashing',
      'OTP Expiry',
      'Verification Endpoint',
      'Attempt Limiting',
    ],
    activeOTPs: otpStore.size,
    rateLimitEntries: rateLimitStore.size,
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log(`✅ Mail API Server running on port ${PORT}`);
  console.log(`🔒 Rate Limiting: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW / 60000} minutes`);
  console.log(`⏱️  OTP Expiry: ${OTP_EXPIRE_MS / 60000} minutes`);
  console.log(`🔐 Max Verify Attempts: ${MAX_VERIFY_ATTEMPTS}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// END OF FILE
// ═══════════════════════════════════════════════════════════════════════════
