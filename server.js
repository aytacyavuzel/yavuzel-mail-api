const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// YENİ HOSTINGER SMTP AYARLARI - GELİŞMİŞ
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: 'iletisim@aytacyavuzel.com',
    pass: process.env.EMAIL_PASSWORD
  },
  tls: {
    rejectUnauthorized: false // SSL sertifika sorunlarını önler
  },
  debug: true, // Debug modu aktif
  logger: true // Detaylı log
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

// ✨ ULTRA PREMIUM Mail şablonu - PWC/Deloitte/EY Seviyesi
function getEmailTemplate(code) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Roboto, Helvetica, Arial, sans-serif;
      background: #0a0a0a;
      padding: 20px;
      line-height: 1.6;
    }
    
    .email-wrapper {
      max-width: 560px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.5);
    }
    
    /* ✨ PREMIUM Header - Deloitte Style */
    .header {
      background: linear-gradient(135deg, #1a0f0d 0%, #2d1612 50%, #1a0f0d 100%);
      padding: 50px 40px;
      text-align: center;
      position: relative;
      overflow: hidden;
    }
    
    .header::before {
      content: '';
      position: absolute;
      top: 0;
      left: -50%;
      width: 200%;
      height: 100%;
      background: linear-gradient(90deg, transparent, rgba(255,140,60,0.15), transparent);
      animation: shimmer 3s ease-in-out infinite;
    }
    
    @keyframes shimmer {
      0%, 100% { transform: translateX(-100%); }
      50% { transform: translateX(100%); }
    }
    
    .logo-box {
      width: 100px;
      height: 100px;
      margin: 0 auto 20px;
      background: rgba(255, 140, 60, 0.12);
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid rgba(255, 140, 60, 0.25);
      position: relative;
      z-index: 1;
    }
    
    .logo-icon {
      width: 50px;
      height: 50px;
      color: #ff8c3a;
    }
    
    .company-name {
      color: #ffffff;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.5px;
      position: relative;
      z-index: 1;
    }
    
    /* ✨ PREMIUM Content - PWC Style */
    .content {
      padding: 50px 40px;
      background: #ffffff;
    }
    
    .greeting {
      font-size: 16px;
      color: #1a1a1a;
      margin-bottom: 20px;
      font-weight: 600;
    }
    
    .message {
      font-size: 15px;
      color: #4a4a4a;
      line-height: 1.8;
      margin-bottom: 35px;
    }
    
    /* ✨ PREMIUM Code Container - EY Style */
    .code-container {
      background: linear-gradient(135deg, #f8f9fa 0%, #ffffff 100%);
      border: 1px solid #e5e7eb;
      border-radius: 16px;
      padding: 35px;
      text-align: center;
      margin: 35px 0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
      position: relative;
      overflow: hidden;
    }
    
    .code-container::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #e4380d, #ff6b3d, #e4380d);
    }
    
    .code-label {
      font-size: 11px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    
    .verification-code {
      font-size: 44px;
      font-weight: 800;
      color: #e4380d;
      letter-spacing: 12px;
      font-family: 'SF Mono', 'Monaco', 'Courier New', monospace;
      margin: 10px 0;
    }
    
    .code-expiry {
      font-size: 13px;
      color: #9ca3af;
      margin-top: 15px;
    }
    
    /* ✨ PREMIUM Security Box */
    .security-box {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-left: 4px solid #f59e0b;
      border-radius: 8px;
      padding: 20px;
      margin: 30px 0;
    }
    
    .security-box strong {
      color: #92400e;
      font-size: 14px;
      display: block;
      margin-bottom: 8px;
    }
    
    .security-box p {
      color: #78350f;
      font-size: 13px;
      line-height: 1.6;
      margin: 0;
    }
    
    .divider {
      height: 1px;
      background: linear-gradient(90deg, transparent, #e5e7eb, transparent);
      margin: 35px 0;
    }
    
    .disclaimer {
      font-size: 13px;
      color: #9ca3af;
      text-align: center;
      line-height: 1.6;
    }
    
    /* ✨ PREMIUM Footer - KPMG Style */
    .footer {
      background: #f9fafb;
      padding: 40px;
      text-align: center;
      border-top: 1px solid #e5e7eb;
    }
    
    .footer-company {
      font-size: 16px;
      font-weight: 700;
      color: #1a1a1a;
      margin-bottom: 12px;
    }
    
    .footer-contact {
      font-size: 13px;
      color: #6b7280;
      margin: 8px 0;
    }
    
    .social-links {
      margin: 25px 0;
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    
    .social-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: #ffffff;
      border: 1px solid #e5e7eb;
      border-radius: 50%;
      color: #6b7280;
      text-decoration: none;
      transition: all 0.3s ease;
    }
    
    .social-icon:hover {
      background: #e4380d;
      border-color: #e4380d;
      color: #ffffff;
      transform: translateY(-2px);
    }
    
    .copyright {
      font-size: 11px;
      color: #9ca3af;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
    }
    
    /* Responsive */
    @media (max-width: 600px) {
      body { padding: 10px; }
      .header { padding: 40px 25px; }
      .content { padding: 35px 25px; }
      .footer { padding: 30px 20px; }
      .verification-code { font-size: 36px; letter-spacing: 8px; }
      .code-container { padding: 25px; }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <!-- ✨ PREMIUM Header -->
    <div class="header">
      <div class="logo-box">
        <svg class="logo-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor" opacity="0.9"/>
          <path d="M2 17L12 22L22 17M2 12L12 17L22 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="company-name">Yavuzel Mali Müşavirlik</div>
    </div>
    
    <!-- ✨ PREMIUM Content -->
    <div class="content">
      <div class="greeting">Değerli Kullanıcı,</div>
      
      <div class="message">
        Hesabınızı doğrulamak için aşağıdaki güvenlik kodunu kullanabilirsiniz. 
        Bu kod yalnızca <strong>10 dakika</strong> süreyle geçerlidir.
      </div>
      
      <!-- ✨ PREMIUM Code Box -->
      <div class="code-container">
        <div class="code-label">Doğrulama Kodunuz</div>
        <div class="verification-code">${code}</div>
        <div class="code-expiry">⏱ 10 dakika içinde geçerli</div>
      </div>
      
      <!-- ✨ PREMIUM Security Notice -->
      <div class="security-box">
        <strong>🔒 Güvenlik Uyarısı</strong>
        <p>
          Bu kodu asla kimseyle paylaşmayın. Yavuzel Mali Müşavirlik, 
          telefon veya e-posta yoluyla doğrulama kodu talep etmez.
        </p>
      </div>
      
      <div class="divider"></div>
      
      <div class="disclaimer">
        Bu e-postayı siz talep etmediyseniz, lütfen dikkate almayın ve 
        hesap güvenliğiniz için şifrenizi değiştirmenizi öneririz.
      </div>
    </div>
    
    <!-- ✨ PREMIUM Footer -->
    <div class="footer">
      <div class="footer-company">Yavuzel Mali Müşavirlik</div>
      <div class="footer-contact">📧 iletisim@aytacyavuzel.com</div>
      <div class="footer-contact">🌐 www.aytacyavuzel.com</div>
      
      <div class="social-links">
        <a href="https://www.instagram.com/aytacyavuzel/" class="social-icon" title="Instagram">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153.509.5.902 1.105 1.153 1.772.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 01-1.153 1.772c-.5.508-1.105.902-1.772 1.153-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 01-1.772-1.153 4.904 4.904 0 01-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 011.153-1.772A4.897 4.897 0 015.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 5a5 5 0 100 10 5 5 0 000-10zm6.5-.25a1.25 1.25 0 10-2.5 0 1.25 1.25 0 002.5 0zM12 9a3 3 0 110 6 3 3 0 010-6z"/>
          </svg>
        </a>
        <a href="https://www.linkedin.com/in/aytac-yavuzel/" class="social-icon" title="LinkedIn">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
        </a>
        <a href="https://www.aytacyavuzel.com" class="social-icon" title="Website">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="2" y1="12" x2="22" y2="12"/>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          </svg>
        </a>
      </div>
      
      <div class="copyright">
        © 2025 Yavuzel Mali Müşavirlik. Tüm hakları saklıdır.<br>
        Bu e-posta otomatik olarak oluşturulmuştur, lütfen yanıtlamayın.
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

// API Endpoint
app.post('/send-code', async (req, res) => {
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
    console.error('Hata kodu:', error.code);
    console.error('Hata stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Mail gönderilemedi',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Yavuzel Mail API - ULTRA PREMIUM',
    version: '3.0',
    emailTemplate: 'PWC/Deloitte/EY Level',
    timestamp: new Date().toISOString()
  });
});

// Server'ı başlat
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🏆 Yavuzel Mail API - ULTRA PREMIUM EDITION!');
  console.log('='.repeat(60));
  console.log(`📡 Port: ${PORT}`);
  console.log(`📧 Mail: iletisim@aytacyavuzel.com`);
  console.log(`🌐 Domain: www.aytacyavuzel.com`);
  console.log(`🔑 Password: ${process.env.EMAIL_PASSWORD ? '✅ Ayarlanmış' : '❌ AYARLANMAMIŞ!'}`);
  console.log(`📮 SMTP: smtp.hostinger.com:465`);
  console.log(`✨ Email Template: PWC/Deloitte/EY Seviyesi`);
  console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
  console.log('='.repeat(60));
});
