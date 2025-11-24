// server.js
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Orijin: www.aytacyavuzel.com / iletisim@aytacyavuzel.com
const EMAIL_USER = 'iletisim@aytacyavuzel.com';
const EMAIL_PASS = process.env.EMAIL_PASSWORD; // ŞİFRE SADECE ENV'DEN GELİR

// Basit kontrol: env yoksa logda uyarı verelim
if (!EMAIL_PASS) {
  console.warn(
    '⚠️ Uyarı: EMAIL_PASSWORD environment variable tanımlı değil. SMTP oturumu başarısız olacaktır.'
  );
}

// Middleware
app.use(cors());
app.use(express.json());

// Hostinger SMTP ayarları
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

// İsteğe bağlı: SMTP bağlantısını verify edelim (log için)
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ SMTP doğrulama hatası:', error.message);
  } else {
    console.log('✅ SMTP bağlantısı hazır (Hostinger).');
  }
});

// 6 haneli rastgele kod üret
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Mail şablonu - şık & kurumsal
function getEmailTemplate(code) {
  return `
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Yavuzel Müşteri Paneli - Doğrulama Kodu</title>
      <style>
        body {
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
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
          padding: 32px 26px;
          text-align: center;
        }
        .logo {
          width: 80px;
          height: 80px;
          margin: 0 auto 16px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: 2px solid rgba(255, 255, 255, 0.4);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .logo-text {
          font-size: 30px;
          font-weight: 800;
          color: #ffffff;
          letter-spacing: 4px;
        }
        .brand-title {
          margin: 0;
          font-size: 22px;
          font-weight: 700;
          color: #ffffff;
        }
        .brand-subtitle {
          margin: 8px 0 0;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.9);
        }
        .content {
          padding: 26px 26px 20px;
        }
        .greeting {
          font-size: 18px;
          font-weight: 600;
          color: #1f2933;
          margin: 0 0 16px;
        }
        .message {
          font-size: 14px;
          color: #4b5563;
          line-height: 1.7;
          margin: 0 0 24px;
        }
        .code-box {
          background: linear-gradient(
            120deg,
            rgba(228, 56, 13, 0.05),
            rgba(255, 140, 58, 0.12)
          );
          border-radius: 16px;
          padding: 16px 16px 18px;
          border: 1px solid rgba(228, 56, 13, 0.35);
          text-align: center;
          margin-bottom: 22px;
        }
        .code-label {
          font-size: 13px;
          color: #7c2d12;
          margin-bottom: 10px;
          font-weight: 500;
        }
        .code {
          display: inline-block;
          background: #ffffff;
          padding: 12px 26px;
          border-radius: 999px;
          font-size: 26px;
          letter-spacing: 8px;
          font-weight: 800;
          color: #e4380d;
          box-shadow: 0 10px 25px rgba(228, 56, 13, 0.25);
        }
        .info {
          font-size: 12px;
          color: #6b7280;
          margin-top: 10px;
          line-height: 1.5;
        }
        .divider {
          height: 1px;
          margin: 22px 0 16px;
          background: linear-gradient(
            to right,
            rgba(0, 0, 0, 0),
            rgba(148, 163, 184, 0.8),
            rgba(0, 0, 0, 0)
          );
        }
        .footer-text {
          font-size: 12px;
          color: #6b7280;
          margin: 0 0 8px;
        }
        .footer-strong {
          color: #111827;
          font-weight: 600;
        }
        .footer {
          background: #f9fafb;
          padding: 16px 26px 20px;
          border-top: 1px solid #e5e7eb;
          text-align: center;
        }
        .link {
          color: #e4380d;
          text-decoration: none;
          font-weight: 600;
        }
        .link:hover {
          text-decoration: underline;
        }
        @media (max-width: 600px) {
          .container {
            margin: 20px auto;
            border-radius: 16px;
          }
          .header {
            padding: 24px 18px;
          }
          .content {
            padding: 20px 18px 16px;
          }
          .code {
            font-size: 22px;
            letter-spacing: 6px;
            padding: 10px 18px;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo">
            <div class="logo-text">AY</div>
          </div>
          <h1 class="brand-title">Yavuzel Mali Müşavirlik</h1>
          <p class="brand-subtitle">Dijital Müşteri Paneli – E-posta Doğrulama</p>
        </div>
        <div class="content">
          <p class="greeting">Merhaba,</p>
          <p class="message">
            Yavuzel Müşteri Paneli kayıt işleminizi tamamlamak için aşağıdaki
            <strong>6 haneli doğrulama kodunu</strong> uygulamaya girmeniz
            gerekmektedir.
          </p>
          <div class="code-box">
            <div class="code-label">E-posta Doğrulama Kodunuz</div>
            <div class="code">${code}</div>
            <p class="info">
              Bu kod güvenliğiniz için kısa süreli geçerlidir ve yalnızca
              <strong>Yavuzel Müşteri Paneli</strong> içerisinde kullanılmalıdır.
            </p>
          </div>
          <div class="divider"></div>
          <p class="footer-text">
            Bu e-posta, <span class="footer-strong">Aytaç Yavuzel</span> tarafından geliştirilen
            <span class="footer-strong">Yavuzel Müşteri Paneli</span> üzerinden otomatik olarak gönderilmiştir.
          </p>
          <p class="footer-text">
            Eğer bu işlemi siz başlatmadıysanız, lütfen bu mesajı dikkate almayınız.
          </p>
        </div>
        <div class="footer">
          <p class="footer-text">
            İletişim: <a class="link" href="mailto:iletisim@aytacyavuzel.com">iletisim@aytacyavuzel.com</a> ·
            <a class="link" href="https://www.aytacyavuzel.com">www.aytacyavuzel.com</a>
          </p>
          <p class="footer-text">
            &copy; ${new Date().getFullYear()} Yavuzel Mali Müşavirlik. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Yavuzel Mail API',
    emailUser: EMAIL_USER,
    hasPassword: !!EMAIL_PASS,
    timestamp: new Date().toISOString(),
  });
});

// POST /send-code
app.post('/send-code', async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'E-posta adresi zorunludur.',
    });
  }

  if (!EMAIL_PASS) {
    return res.status(500).json({
      success: false,
      message:
        'Sunucu e-posta gönderimi için yapılandırılmamış (EMAIL_PASSWORD tanımlı değil).',
    });
  }

  const code = generateVerificationCode();
  const mailOptions = {
    from: `"Yavuzel Mali Müşavirlik" <${EMAIL_USER}>`,
    to: email,
    subject: 'Yavuzel Müşteri Paneli - E-posta Doğrulama Kodunuz',
    html: getEmailTemplate(code),
  };

  try {
    console.log(`📧 Doğrulama kodu gönderiliyor → ${email} | Kod: ${code}`);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Mail başarıyla gönderildi:', info.messageId);

    res.json({
      success: true,
      message: 'Doğrulama kodu e-posta adresinize gönderildi.',
      code, // mobil taraf sadece doğrulama için kullanıyor
    });
  } catch (error) {
    console.error('❌ Mail gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'Mail gönderilemedi.',
      error: error.message,
    });
  }
});

// Sunucuyu başlat
app.listen(PORT, () => {
  console.log(`🚀 Yavuzel Mail API çalışıyor - Port: ${PORT}`);
  console.log(`📧 Gönderen adres: ${EMAIL_USER}`);
});
