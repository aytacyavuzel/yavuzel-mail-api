const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ============================================================================
// ⭐ RATE LIMITING - YENİ!
// ============================================================================
// Basit in-memory rate limiter
const rateLimitStore = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 dakika
  const maxRequests = 5; // Max 5 istek

  // Store'dan IP'yi al
  const record = rateLimitStore.get(ip) || { count: 0, resetTime: now + windowMs };

  // Reset time geçtiyse sıfırla
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + windowMs;
  }

  // Limit aşıldı mı?
  if (record.count >= maxRequests) {
    const remainingTime = Math.ceil((record.resetTime - now) / 1000 / 60);
    return res.status(429).json({
      success: false,
      message: `Çok fazla istek. Lütfen ${remainingTime} dakika sonra tekrar deneyin.`,
      retryAfter: remainingTime
    });
  }

  // Count artır
  record.count++;
  rateLimitStore.set(ip, record);

  // Cleanup eski kayıtlar (her 30 dakikada bir)
  if (Math.random() < 0.01) {
    for (const [key, value] of rateLimitStore.entries()) {
      if (now > value.resetTime + windowMs) {
        rateLimitStore.delete(key);
      }
    }
  }

  next();
}

// ============================================================================
// SMTP AYARLARI
// ============================================================================
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: 'iletisim@aytacyavuzel.com',
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false
  },
  debug: true,
  logger: true
});

// SMTP bağlantısını test et
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ SMTP Bağlantı Hatası:', error);
    console.error('Email:', 'iletisim@aytacyavuzel.com');
    console.error('Password var mı?:', !!process.env.EMAIL_PASSWORD);
  } else {
    console.log('✅ SMTP Sunucusu Hazır - Mail gönderilebilir!');
  }
});

// 6 haneli rastgele kod üret
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Mail şablonu
function getEmailTemplate(code) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #1a0f0d 0%, #2d1612 100%);
        }
        .container {
          max-width: 600px;
          margin: 40px auto;
          background: #ffffff;
          border-radius: 20px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }
        .header {
          background: linear-gradient(135deg, #e4380d 0%, #ff6b3d 100%);
          padding: 40px 30px;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          margin: 0 auto 20px;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .header h1 {
          color: #ffffff;
          margin: 0;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 0.5px;
        }
        .content {
          padding: 40px 30px;
          background: #ffffff;
        }
        .greeting {
          font-size: 18px;
          color: #2d1612;
          margin-bottom: 20px;
          font-weight: 600;
        }
        .message {
          font-size: 15px;
          color: #555;
          line-height: 1.8;
          margin-bottom: 30px;
        }
        .code-container {
          background: linear-gradient(135deg, #fff5f0 0%, #ffe5d9 100%);
          border: 2px solid #ff8c3a;
          border-radius: 16px;
          padding: 30px;
          text-align: center;
          margin: 30px 0;
        }
        .code-label {
          font-size: 14px;
          color: #e4380d;
          margin-bottom: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 1px;
        }
        .code {
          font-size: 42px;
          font-weight: 800;
          color: #e4380d;
          letter-spacing: 8px;
          font-family: 'Courier New', monospace;
        }
        .expire-notice {
          font-size: 13px;
          color: #e4380d;
          margin-top: 12px;
          font-weight: 600;
        }
        .warning {
          background: #fff9e6;
          border-left: 4px solid #fbbf24;
          padding: 16px 20px;
          border-radius: 8px;
          margin: 25px 0;
        }
        .warning p {
          margin: 0;
          font-size: 14px;
          color: #92400e;
          line-height: 1.6;
        }
        .footer {
          background: #f9fafb;
          padding: 30px;
          text-align: center;
          border-top: 1px solid #e5e7eb;
        }
        .footer-text {
          font-size: 13px;
          color: #6b7280;
          margin: 8px 0;
          line-height: 1.6;
        }
        @media (max-width: 600px) {
          .container {
            margin: 20px;
          }
          .header, .content, .footer {
            padding: 25px 20px;
          }
          .code {
            font-size: 36px;
            letter-spacing: 6px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" opacity="0.9"/>
              <path d="M2 17L12 22L22 17" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1>Yavuzel Mali Müşavirlik</h1>
        </div>
        
        <div class="content">
          <p class="greeting">Merhaba,</p>
          
          <p class="message">
            Hesabınızı doğrulamak için aşağıdaki 6 haneli kodu kullanın.
          </p>
          
          <div class="code-container">
            <div class="code-label">Doğrulama Kodunuz</div>
            <div class="code">${code}</div>
            <div class="expire-notice">⏰ Bu kod 2 dakika boyunca geçerlidir</div>
          </div>
          
          <div class="warning">
            <p>
              <strong>⚠️ Güvenlik Uyarısı:</strong><br>
              Bu kodu kimseyle paylaşmayın. Yavuzel Mali Müşavirlik asla 
              telefon veya e-posta ile doğrulama kodu istemez.
            </p>
          </div>
          
          <p class="message" style="margin-bottom: 0;">
            Bu maili siz istemediyseniz, lütfen dikkate almayın.
          </p>
        </div>
        
        <div class="footer">
          <p class="footer-text" style="font-weight: 600; color: #374151;">
            Yavuzel Mali Müşavirlik
          </p>
          <p class="footer-text">
            📧 iletisim@aytacyavuzel.com<br>
            🌐 www.aytacyavuzel.com
          </p>
          <p class="footer-text" style="font-size: 11px;">
            © 2025 Yavuzel Mali Müşavirlik. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// ============================================================================
// API ENDPOINT - RATE LIMITED! ⭐
// ============================================================================
app.post('/send-code', rateLimit, async (req, res) => {
  try {
    const { email } = req.body;

    console.log('📧 Mail gönderme isteği alındı:', email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'E-posta adresi gerekli'
      });
    }

    // Doğrulama kodu üret
    const verificationCode = generateVerificationCode();
    console.log('🔑 Kod üretildi:', verificationCode);

    // Mail gönder
    const mailOptions = {
      from: {
        name: 'Yavuzel Mali Müşavirlik',
        address: 'iletisim@aytacyavuzel.com'
      },
      to: email,
      subject: `🔐 Doğrulama Kodunuz: ${verificationCode}`,
      html: getEmailTemplate(verificationCode)
    };

    console.log('📨 Mail gönderiliyor...');
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Mail gönderildi!');
    console.log('📬 Message ID:', info.messageId);
    console.log('📧 Gönderilen:', email);

    res.json({
      success: true,
      message: 'Doğrulama kodu gönderildi',
      code: verificationCode // Production'da bunu kaldırın!
    });

  } catch (error) {
    console.error('❌ DETAYLI HATA:', error);
    console.error('Hata mesajı:', error.message);
    
    res.status(500).json({
      success: false,
      message: 'Mail gönderilemedi',
      error: error.message
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Yavuzel Mail API',
    version: '2.1 - Rate Limited',
    rateLimit: '5 requests / 15 minutes',
    timestamp: new Date().toISOString()
  });
});

// Server'ı başlat
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 Yavuzel Mail API Başlatıldı!');
  console.log('='.repeat(60));
  console.log(`📡 Port: ${PORT}`);
  console.log(`📧 Mail: iletisim@aytacyavuzel.com`);
  console.log(`🔒 Rate Limit: 5 requests / 15 minutes`);
  console.log(`⏰ OTP Expire: 2 minutes`);
  console.log(`⏱ Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
});
