// ═══════════════════════════════════════════════════════════════════════════
// 📧 MAIL API SERVER - OTP WITH VERIFICATION (SECURE)
// ═══════════════════════════════════════════════════════════════════════════
// Version: 3.2 - Production Ready
// ═══════════════════════════════════════════════════════════════════════════

const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════════════════════════════
// ⚠️ ENVIRONMENT VARIABLES CHECK
// ═══════════════════════════════════════════════════════════════════════════

if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error('❌ ERROR: SMTP_USER and SMTP_PASS environment variables are required!');
  console.error('Please set them in Render dashboard: Environment → Environment Variables');
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());

// Request logging (production)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ═══════════════════════════════════════════════════════════════════════════
// IN-MEMORY STORAGE
// ═══════════════════════════════════════════════════════════════════════════

const rateLimitStore = new Map();
const otpStore = new Map();

const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;
const OTP_EXPIRE_MS = 2 * 60 * 1000; // 2 minutes
const OTP_LENGTH = 6;
const MAX_VERIFY_ATTEMPTS = 3;

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL TRANSPORTER (Using Environment Variables)
// ═══════════════════════════════════════════════════════════════════════════

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  connectionTimeout: 10000, // 10 seconds
  greetingTimeout: 5000,
});

// Test connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP connection failed:', error);
  } else {
    console.log('✅ SMTP connection successful');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

const rateLimiter = (req, res, next) => {
  const clientIp = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  
  let clientData = rateLimitStore.get(clientIp);
  
  if (!clientData || now > clientData.resetTime) {
    clientData = {
      count: 0,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
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

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════════════════

const cleanupStores = () => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [ip, data] of rateLimitStore.entries()) {
    if (now > data.resetTime) {
      rateLimitStore.delete(ip);
      cleaned++;
    }
  }
  
  for (const [email, data] of otpStore.entries()) {
    if (now > data.expireTime) {
      otpStore.delete(email);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired entries`);
  }
};

setInterval(cleanupStores, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: GENERATE OTP
// ═══════════════════════════════════════════════════════════════════════════

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: SEND OTP
// ═══════════════════════════════════════════════════════════════════════════

app.post('/send-code', rateLimiter, async (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({
      success: false,
      message: 'Geçerli bir e-posta adresi girin',
    });
  }
  
  try {
    const code = generateOTP();
    const hashedCode = await bcrypt.hash(code, 10);
    const expireTime = Date.now() + OTP_EXPIRE_MS;
    
    otpStore.set(email, {
      hashedCode,
      expireTime,
      attempts: 0,
    });
    
    const mailOptions = {
      from: `"Aytaç Yavuzel" <${process.env.SMTP_USER}>`,
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
    
    await transporter.sendMail(mailOptions);
    
    console.log(`✅ OTP sent to ${email}`);
    
    if (Math.random() < 0.1) {
      cleanupStores();
    }
    
    res.json({
      success: true,
      message: 'Doğrulama kodu e-posta adresinize gönderildi',
      expiresIn: 120,
    });
    
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'E-posta gönderilemedi. Lütfen tekrar deneyin.',
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ENDPOINT: VERIFY OTP (Main + Alias)
// ═══════════════════════════════════════════════════════════════════════════

const verifyOtpHandler = async (req, res) => {
  const { email, code } = req.body;
  
  if (!email || !code) {
    return res.status(400).json({
      success: false,
      message: 'E-posta ve kod gereklidir',
    });
  }
  
  const otpData = otpStore.get(email);
  
  if (!otpData) {
    return res.status(404).json({
      success: false,
      message: 'Doğrulama kodu bulunamadı. Lütfen yeni kod gönderin.',
    });
  }
  
  if (Date.now() > otpData.expireTime) {
    otpStore.delete(email);
    return res.status(410).json({
      success: false,
      message: 'Kodun süresi doldu. Lütfen yeni kod gönderin.',
    });
  }
  
  if (otpData.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(email);
    return res.status(429).json({
      success: false,
      message: 'Çok fazla hatalı deneme. Lütfen yeni kod gönderin.',
    });
  }
  
  const isValid = await bcrypt.compare(code, otpData.hashedCode);
  
  if (isValid) {
    otpStore.delete(email);
    console.log(`✅ OTP verified for ${email}`);
    return res.json({
      success: true,
      message: 'E-posta doğrulandı',
    });
  } else {
    otpData.attempts++;
    otpStore.set(email, otpData);
    
    const remainingAttempts = MAX_VERIFY_ATTEMPTS - otpData.attempts;
    
    console.log(`⚠️ Invalid OTP for ${email}, ${remainingAttempts} attempts left`);
    
    return res.status(400).json({
      success: false,
      message: `Hatalı kod. ${remainingAttempts} deneme hakkınız kaldı.`,
      remainingAttempts,
    });
  }
};

// Both endpoints use same handler
app.post('/verify-otp', verifyOtpHandler);
app.post('/verify-code', verifyOtpHandler); // Alias for compatibility

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    version: '3.2',
    timestamp: new Date().toISOString(),
    features: [
      'Rate Limiting',
      'OTP Hashing',
      'OTP Expiry',
      'Verification Endpoint',
      'Attempt Limiting',
      'Environment Variables',
      'Endpoint Aliases',
      'Request Logging',
    ],
    smtp: {
      configured: !!process.env.SMTP_USER && !!process.env.SMTP_PASS,
      user: process.env.SMTP_USER ? `${process.env.SMTP_USER.substring(0, 3)}***` : 'NOT SET',
    },
    stats: {
      activeOTPs: otpStore.size,
      rateLimitEntries: rateLimitStore.size,
    },
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Mail API Server',
    version: '3.2',
    endpoints: [
      'POST /send-code - Send OTP',
      'POST /verify-otp - Verify OTP',
      'POST /verify-code - Verify OTP (alias)',
      'GET /health - Health check',
    ],
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    availableEndpoints: ['/send-code', '/verify-otp', '/verify-code', '/health'],
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ Mail API Server v3.2 - Production Ready');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🌐 Port: ${PORT}`);
  console.log(`🔒 Rate Limiting: ${RATE_LIMIT_MAX} requests per ${RATE_LIMIT_WINDOW / 60000} minutes`);
  console.log(`⏱️  OTP Expiry: ${OTP_EXPIRE_MS / 60000} minutes`);
  console.log(`🔐 Max Verify Attempts: ${MAX_VERIFY_ATTEMPTS}`);
  console.log(`📧 SMTP User: ${process.env.SMTP_USER || 'NOT SET'}`);
  console.log('═══════════════════════════════════════════════════════════');
});
