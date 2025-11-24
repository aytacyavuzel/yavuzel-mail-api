// server.js
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

// Hostinger SMTP ayarları
// ŞİFREYİ ENV'DEN OKUYOR, YOKSA ALTTAKİ PLACEHOLDER KULLANILIYOR
const EMAIL_USER = process.env.EMAIL_USER || 'iletisim@aytacyavuzel.com';
const EMAIL_PASS = process.env.EMAIL_PASSWORD || 'BURAYA_HOSTINGER_MAIL_SIFRENIZI_YAZIN';

const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
  tls: {
    // Bazı hostinglerde sertifika sorunu olursa mailin takılmasını engeller
    rejectUnauthorized: false,
  },
});

// Sağlık kontrolü
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Yavuzel Mail API çalışıyor' });
});

// Doğrulama kodu üret
const generateCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Doğrulama kodu gönderme endpoint'i
app.post('/send-code', async (req, res) => {
  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({
      success: false,
      message: 'E-posta adresi zorunludur.',
    });
  }

  const code = generateCode();

  const mailOptions = {
    from: `"Yavuzel Mali Müşavirlik" <${EMAIL_USER}>`,
    to: email,
    subject: 'Yavuzel Müşteri Paneli - E-posta Doğrulama Kodunuz',
    html: `
      <div style="font-family: Arial, sans-serif; background-color:#f5f5f5; padding:32px;">
        <div style="max-width:520px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #eee;">
          <div style="background:linear-gradient(135deg,#e4380d,#ff8c3a); padding:22px 24px;">
            <h1 style="margin:0; font-size:20px; color:#ffffff;">Yavuzel Müşteri Paneli</h1>
            <p style="margin:8px 0 0; font-size:13px; color:rgba(255,255,255,0.85);">
              E-posta Doğrulama Kodunuz
            </p>
          </div>
          <div style="padding:24px 24px 12px;">
            <p style="font-size:14px; color:#111827; margin:0 0 14px;">
              Merhaba,
            </p>
            <p style="font-size:14px; color:#4b5563; margin:0 0 18px; line-height:1.5;">
              Yavuzel Müşteri Paneli kayıt işleminizi tamamlamak için aşağıdaki
              <strong>6 haneli doğrulama kodunu</strong> uygulamaya girmeniz gerekmektedir.
            </p>
            <div style="text-align:center; margin:18px 0 20px;">
              <div style="
                display:inline-block;
                padding:14px 26px;
                border-radius:999px;
                background:rgba(228,56,13,0.06);
                border:1px solid rgba(228,56,13,0.35);
              ">
                <span style="font-size:28px; letter-spacing:8px; color:#e4380d; font-weight:700;">
                  ${code}
                </span>
              </div>
            </div>
            <p style="font-size:12px; color:#6b7280; margin:0 0 6px;">
              Bu kod güvenliğiniz için <strong>kısa bir süre</strong> geçerlidir ve
              yalnızca <strong>Yavuzel Müşteri Paneli</strong> uygulamasında kullanılmalıdır.
            </p>
            <p style="font-size:12px; color:#9ca3af; margin:0 0 4px;">
              Bu işlemi siz gerçekleştirmediyseniz, lütfen bu e-postayı dikkate almayınız.
            </p>
          </div>
          <div style="padding:14px 24px 18px; border-top:1px solid #f3f4f6;">
            <p style="font-size:11px; color:#9ca3af; margin:0;">
              Yavuzel Mali Müşavirlik • www.aytacyavuzel.com • iletisim@aytacyavuzel.com
            </p>
          </div>
        </div>
      </div>
    `,
  };

  try {
    console.log('📨 Doğrulama kodu gönderiliyor:', email, 'Kod:', code);

    await transporter.sendMail(mailOptions);

    console.log('✅ E-posta başarıyla gönderildi →', email);

    // Mobil uygulama doğrulama için kodu da alıyor
    res.json({
      success: true,
      code,
    });
  } catch (error) {
    console.error('❌ Mail gönderme hatası:', error);
    res.status(500).json({
      success: false,
      message: 'E-posta gönderilirken bir hata oluştu.',
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Yavuzel Mail API ${PORT} portunda çalışıyor`);
  console.log(`📩 Gönderen adres: ${EMAIL_USER}`);
});
