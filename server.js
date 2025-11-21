const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { Resend } = require('resend');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// =============================
//  R E S E N D   A Y A R I
// =============================
//
// Render ortam değişkenleri:
//
//  RESEND_API_KEY = (Resend dashboard'taki API key)
//  FROM_EMAIL     = doğruladığın gönderici adres
//
// Örnek FROM_EMAIL:
//   "YAVUZEL Panel <no-reply@aytacyavuzel.com>"
//   veya
//   "YAVUZEL Panel <iletisim@aytacyavuzel.com>"
//
const resend = new Resend(process.env.RESEND_API_KEY);

// Basit test endpoint'i
app.get('/', (req, res) => {
  res.send('YAVUZEL Mail API ayakta (Resend)');
});

// Doğrulama kodu gönderme endpoint'i
app.post('/send-code', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: 'Email gerekli' });
    }

    if (!process.env.RESEND_API_KEY) {
      return res
        .status(500)
        .json({ success: false, message: 'RESEND_API_KEY tanımlı değil' });
    }

    if (!process.env.FROM_EMAIL) {
      return res
        .status(500)
        .json({ success: false, message: 'FROM_EMAIL tanımlı değil' });
    }

    // 6 haneli kod üret
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Düz metin (fallback)
    const textBody = `Merhaba,

YAVUZEL Panel için e-posta doğrulama kodunuz: ${code}

Bu kodu uygulamadaki ilgili alana girerek işlemi tamamlayabilirsiniz.

İyi çalışmalar,
YAVUZEL`;

    // HTML gövde (şık tasarım, hizalama ve kod tek satır düzeltildi)
    const htmlBody = `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <title>YAVUZEL Panel - E-posta Doğrulama Kodu</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e6ea;box-shadow:0 12px 28px rgba(0,0,0,0.06);">
          <!-- Üst şerit -->
          <tr>
            <td style="background:linear-gradient(90deg,#2b1410,#e4380d,#ff8c3a);padding:16px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.04em;vertical-align:middle;">
                    YAVUZEL PANEL
                  </td>
                  <td align="right" style="font-size:11px;color:rgba(255,255,255,0.85);vertical-align:middle;letter-spacing:0.12em;white-space:nowrap;">
                    MUHASEBE · FİNANS · EKONOMİ
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- İçerik -->
          <tr>
            <td style="padding:24px 24px 8px 24px;">
              <p style="margin:0 0 8px 0;font-size:14px;color:#555c6b;">Merhaba,</p>
              <p style="margin:0 0 18px 0;font-size:14px;color:#555c6b;line-height:1.6;">
                YAVUZEL Panel için e-posta doğrulama isteğinde bulundunuz. İşleminizi tamamlamak için aşağıdaki
                <strong style="color:#e4380d;">6 haneli kodu</strong> uygulamadaki ilgili alana giriniz.
              </p>

              <!-- Kod kartı -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px 0;">
                <tr>
                  <td align="center">
                    <div style="
                      display:inline-block;
                      padding:14px 22px;
                      border-radius:999px;
                      background:linear-gradient(135deg,#2b1410,#4b1e16);
                      border:1px solid rgba(255,140,60,0.45);
                      box-shadow:0 10px 24px rgba(0,0,0,0.16);
                    ">
                      <span style="font-size:13px;color:rgba(255,255,255,0.72);margin-right:10px;letter-spacing:0.08em;text-transform:uppercase;">
                        Doğrulama Kodu
                      </span>
                      <span style="
                        font-size:22px;
                        font-weight:800;
                        letter-spacing:0.32em;
                        color:#ffefe4;
                        display:inline-block;
                        white-space:nowrap;
                      ">
                        ${code}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 6px 0;font-size:12px;color:#777d8c;line-height:1.6;">
                Bu kod güvenliğiniz için <strong>kısa süreli</strong> geçerlidir ve yalnızca sizin tarafınızdan kullanılmalıdır.
              </p>
              <p style="margin:0 0 18px 0;font-size:12px;color:#777d8c;line-height:1.6;">
                Siz böyle bir işlem başlatmadıysanız bu e-postayı dikkate almayabilirsiniz.
              </p>
            </td>
          </tr>

          <!-- Alt bilgi -->
          <tr>
            <td style="padding:14px 24px 18px 24px;border-top:1px solid #f0f0f3;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="left" style="font-size:12px;color:#9b9fab;">
                    Saygılarımızla,<br />
                    <strong style="color:#33363f;">YAVUZEL</strong>
                  </td>
                  <td align="right" style="font-size:11px;color:#b1b5c0;">
                    Bu e-posta otomatik olarak oluşturulmuştur, lütfen yanıtlamayınız.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>

        <!-- Alt copyright -->
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin-top:10px;">
          <tr>
            <td align="center" style="font-size:11px;color:#a0a4b0;">
              © ${new Date().getFullYear()} YAVUZEL · Tüm hakları saklıdır.
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>
`;

    // Resend ile mail gönder
    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: email,
      subject: 'YAVUZEL Panel – E-posta Doğrulama Kodunuz',
      text: textBody,
      html: htmlBody,
    });

    if (error) {
      console.error('Resend hata:', error);
      return res.status(500).json({
        success: false,
        message: 'Mail gönderilemedi (Resend)',
        error: error.message || String(error),
      });
    }

    console.log('📧 Kod gönderildi (Resend):', email, '→', code);

    // Kodu app'e geri döndür
    return res.json({ success: true, code });
  } catch (err) {
    console.error('Mail gönderme hatası (genel):', err);

    return res.status(500).json({
      success: false,
      message: 'Mail gönderilemedi (server)',
      error: err.message || String(err),
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`📡 Mail API ayakta (Resend): http://localhost:${PORT}`);
});
