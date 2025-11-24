const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// YENİ HOSTINGER SMTP AYARLARI
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: 'iletisim@aytacyavuzel.com', // YENİ MAİL ADRESİ
    pass: process.env.EMAIL_PASSWORD || 'ŞİFRENİZİ_BURAYA_GİRİN' // Render'da environment variable olarak ekleyin
  }
});

// 6 haneli rastgele kod üret
function generateVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Mail şablonu - ŞIK VE KURUMSAL
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
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.12);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(255, 255, 255, 0.4);
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.25);
        }
        .logo-text {
          font-size: 30px;
          color: #ffffff;
          font-weight: 800;
          letter-spacing: 4px;
        }
        .brand-title {
          margin: 0;
          font-size: 22px;
          color: #ffffff;
          font-weight: 700;
          letter-spacing: 1px;
        }
        .brand-subtitle {
          margin: 8px 0 0;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.9);
        }
        .content {
          padding: 30px 30px 24px;
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
          background: linear-gradient(120deg, rgba(228, 56, 13, 0.05), rgba(255, 140, 58, 0.12));
          border-radius: 16px;
          padding: 18px 16px;
          margin-bottom: 24px;
          border: 1px solid rgba(228, 56, 13, 0.45);
          text-align: center;
        }
        .code-label {
          font-size: 13px;
          color: #7c2d12;
          margin-bottom: 10px;
          font-weight: 500;
          letter-spacing: 0.5px;
        }
        .code {
          display: inline-block;
          font-size: 28px;
          letter-spacing: 8px;
          font-weight: 800;
          color: #e4380d;
          padding: 12px 28px;
          background: #ffffff;
          border-radius: 999px;
          box-shadow: 0 12px 30px rgba(228, 56, 13, 0.25);
        }
        .info-text {
          font-size: 13px;
          color: #6b7280;
          line-height: 1.6;
          margin-top: 8px;
        }
        .divider {
          height: 1px;
          background: linear-gradient(to right, rgba(0,0,0,0), rgba(148,163,184,0.7), rgba(0,0,0,0));
          margin: 24px 0 18px;
        }
        .footer {
          padding: 18px 30px 24px;
          background: #f9fafb;
          border-top: 1px solid #e5e7eb;
          text-align: center;
        }
        .footer-text {
          font-size: 12px;
          color: #6b7280;
          margin: 0 0 8px;
        }
        .footer-brand {
          font-size: 13px;
          color: #111827;
          font-weight: 600;
        }
        .social-links {
          margin: 20px 0;
        }
        .social-link {
          display: inline-block;
          margin: 0 8px;
          padding: 10px 20px;
          background: #e4380d;
          color: #ffffff;
          text-decoration: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease,
            background 0.2s ease;
        }
        .social-link:hover {
          transform: translateY(-1px);
          box-shadow: 0 10px 25px rgba(228, 56, 13, 0.35);
          background: #c92c08;
        }
        .website-link {
          color: #e4380d;
          text-decoration: none;
          font-weight: 600;
        }
        .website-link:hover {
          text-decoration: underline;
        }
        @media (max-width: 600px) {
          .container {
            margin: 20px auto;
            border-radius: 16px;
          }
          .header {
            padding: 28px 18px;
          }
          .content {
            padding: 22px 18px 18px;
          }
          .code {
            font-size: 24px;
            letter-spacing: 6px;
            padding: 10px 22px;
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
          <p class="brand-subtitle">Dijital Müşteri Paneli - E-posta Doğrulama</p>
        </div>
        <div class="content">
          <p class="greeting">Merhaba,</p>
          <p class="message">
            Yavuzel Müşteri Paneli kayıt işleminizi tamamlamak için aşağıdaki
            <strong>6 haneli doğrulama kodunu</strong> uygulamaya girmeniz gerekmektedir.
          </p>
          <div class="code-container">
            <div class="code-label">E-Posta Doğrulama Kodunuz</div>
            <div class="code">${code}</div>
            <p class="info-text">
              Bu kod güvenliğiniz için kısa süreli geçerlidir ve sadece
              <strong>Yavuzel Mali Müşavirlik</strong> uygulaması içerisinde kullanılmalıdır.
            </p>
          </div>
          <div class="divider"></div>
          <p class="footer-text">
            Bu e-posta, <span class="footer-brand">Aytaç Yavuzel</span> tarafından geliştirilen
            <strong>Yavuzel Müşteri Paneli</strong> üzerinden otomatik olarak gönderilmiştir.
          </p>
          <p class="footer-text">
            Eğer bu işlemi siz başlatmadıysanız, lütfen bu mesajı dikkate almayınız.
          </p>
          <div class="social-links">
            <a class="social-link" href="https://www.instagram.com/aytacyavuzel" target="_blank">
              Instagram
            </a>
            <a class="social-link" href="https://www.linkedin.com/in/aytac-yavuzel" target="_blank">
              LinkedIn
            </a>
            <a class="social-link" href="https://www.aytacyavuzel.com" target="_blank">
              Web Sitesi
            </a>
          </div>
          <p class="footer-text">
            Daha fazla bilgi için web sitemizi ziyaret edebilir veya bizimle
            <a class="website-link" href="mailto:iletisim@aytacyavuzel.com">iletisim@aytacyavuzel.com</a>
            adresi üzerinden iletişime geçebilirsiniz.
          </p>
        </div>
        <div class="footer">
          <p class="footer-text">
            &copy; ${new Date().getFullYear()} Yavuzel Mali Müşavirlik. Tüm hakları saklıdır.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
}

// POST /send-code endpoint'i
app.post('/send-code', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'E-posta adresi zorunludur'
    });
  }

  const code = generateVerificationCode();
  const mailOptions = {
    from: '"Yavuzel Mali Müşavirlik" <iletisim@aytacyavuzel.com>',
    to: email,
    subject: 'Yavuzel Müşteri Paneli - E-posta Doğrulama Kodunuz',
    html: getEmailTemplate(code)
  };

  try {
    console.log(`📧 Doğrulama kodu gönderiliyor → ${email} | Kod: ${code}`);
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Mail başarıyla gönderildi:', info.messageId);

    res.json({
      success: true,
      message: 'Doğrulama kodu e-posta adresinize gönderildi',
      code // Mobil uygulama tarafında gösterilmeyecek, sadece kontrol için döndürülüyor
    });
  } catch (error) {
    console.error('❌ Mail gönderme hatası:', error);
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
    version: '2.0',
    timestamp: new Date().toISOString()
  });
});

// Server'ı başlat
app.listen(PORT, () => {
  console.log(`🚀 Mail API çalışıyor - Port: ${PORT}`);
  console.log(`📧 Mail Adresi: iletisim@aytacyavuzel.com`);
  console.log(`🌐 Domain: www.aytacyavuzel.com`);
});
