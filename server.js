const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Routes
const mailRoutes = require('./routes/mail');
const maliRoutes = require('./routes/mali');
const accountingRoutes = require('./routes/accounting');

app.use('/mail', mailRoutes);
app.use('/api', maliRoutes);
app.use('/api/accounting', accountingRoutes);

// ============================================
// ADMIN PANELİ - PDF YÜKLEME ARAYÜZÜ
// ============================================
app.get('/admin', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Yavuzel Admin Panel</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: #1e293b;
      border-radius: 24px;
      padding: 40px;
      width: 100%;
      max-width: 500px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
      border: 1px solid #334155;
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo h1 {
      color: #f8fafc;
      font-size: 24px;
      font-weight: 700;
    }
    .logo p {
      color: #64748b;
      font-size: 14px;
      margin-top: 8px;
    }
    .form-group {
      margin-bottom: 20px;
    }
    label {
      display: block;
      color: #94a3b8;
      font-size: 14px;
      margin-bottom: 8px;
      font-weight: 500;
    }
    input[type="password"] {
      width: 100%;
      padding: 14px 16px;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 12px;
      color: #f8fafc;
      font-size: 16px;
      outline: none;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus {
      border-color: #6366f1;
    }
    .file-upload {
      border: 2px dashed #334155;
      border-radius: 16px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: #0f172a;
    }
    .file-upload:hover {
      border-color: #6366f1;
      background: #1e293b;
    }
    .file-upload.dragover {
      border-color: #6366f1;
      background: rgba(99, 102, 241, 0.1);
    }
    .file-upload svg {
      width: 48px;
      height: 48px;
      color: #6366f1;
      margin-bottom: 16px;
    }
    .file-upload p {
      color: #94a3b8;
      font-size: 14px;
    }
    .file-upload span {
      color: #6366f1;
      font-weight: 600;
    }
    input[type="file"] {
      display: none;
    }
    .file-count {
      background: #6366f1;
      color: white;
      padding: 12px 20px;
      border-radius: 12px;
      margin-top: 16px;
      font-weight: 600;
      display: none;
    }
    .btn {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 24px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(99, 102, 241, 0.3);
    }
    .btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }
    .results {
      margin-top: 24px;
      padding: 20px;
      background: #0f172a;
      border-radius: 12px;
      display: none;
    }
    .results h3 {
      color: #f8fafc;
      font-size: 16px;
      margin-bottom: 16px;
    }
    .result-item {
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .result-item.success {
      background: rgba(34, 197, 94, 0.1);
      color: #22c55e;
      border: 1px solid rgba(34, 197, 94, 0.2);
    }
    .result-item.error {
      background: rgba(239, 68, 68, 0.1);
      color: #ef4444;
      border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .summary {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }
    .summary-item {
      flex: 1;
      padding: 16px;
      border-radius: 12px;
      text-align: center;
    }
    .summary-item.success {
      background: rgba(34, 197, 94, 0.1);
      border: 1px solid rgba(34, 197, 94, 0.2);
    }
    .summary-item.error {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
    }
    .summary-item .number {
      font-size: 32px;
      font-weight: 700;
    }
    .summary-item.success .number { color: #22c55e; }
    .summary-item.error .number { color: #ef4444; }
    .summary-item .label {
      font-size: 12px;
      color: #94a3b8;
      margin-top: 4px;
    }
    .loading {
      display: none;
      text-align: center;
      padding: 20px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #334155;
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading p {
      color: #94a3b8;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>🔐 Yavuzel Admin Panel</h1>
      <p>Beyanname PDF Yükleme Sistemi</p>
    </div>

    <div class="form-group">
      <label>Admin Şifresi</label>
      <input type="password" id="password" placeholder="••••••••">
    </div>

    <div class="form-group">
      <label>PDF Dosyaları</label>
      <div class="file-upload" id="dropZone">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p><span>Dosya seç</span> veya sürükle bırak</p>
        <p style="margin-top: 8px; font-size: 12px;">Maksimum 200 PDF</p>
        <input type="file" id="fileInput" multiple accept="application/pdf">
      </div>
      <div class="file-count" id="fileCount"></div>
    </div>

    <button class="btn" id="uploadBtn" disabled>Yükle</button>

    <div class="loading" id="loading">
      <div class="spinner"></div>
      <p>PDF'ler işleniyor...</p>
    </div>

    <div class="results" id="results">
      <div class="summary">
        <div class="summary-item success">
          <div class="number" id="successCount">0</div>
          <div class="label">Başarılı</div>
        </div>
        <div class="summary-item error">
          <div class="number" id="errorCount">0</div>
          <div class="label">Hatalı</div>
        </div>
      </div>
      <h3>Detaylar</h3>
      <div id="resultList"></div>
    </div>
  </div>

  <script>
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const fileCount = document.getElementById('fileCount');
    const uploadBtn = document.getElementById('uploadBtn');
    const password = document.getElementById('password');
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');

    let selectedFiles = [];

    // Click to select
    dropZone.addEventListener('click', () => fileInput.click());

    // Drag & Drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
    });

    function handleFiles(files) {
      selectedFiles = Array.from(files).filter(f => f.type === 'application/pdf');
      if (selectedFiles.length > 0) {
        fileCount.style.display = 'block';
        fileCount.textContent = selectedFiles.length + ' PDF seçildi';
        uploadBtn.disabled = false;
      } else {
        fileCount.style.display = 'none';
        uploadBtn.disabled = true;
      }
    }

    // Upload
    uploadBtn.addEventListener('click', async () => {
      if (!password.value) {
        alert('Şifre gerekli!');
        return;
      }

      if (selectedFiles.length === 0) {
        alert('PDF seçin!');
        return;
      }

      uploadBtn.disabled = true;
      loading.style.display = 'block';
      results.style.display = 'none';

      const formData = new FormData();
      formData.append('password', password.value);
      selectedFiles.forEach(file => formData.append('pdfs', file));

      try {
        const res = await fetch('/api/admin/upload-pdfs', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        
        loading.style.display = 'none';
        results.style.display = 'block';

        if (data.error) {
          document.getElementById('successCount').textContent = '0';
          document.getElementById('errorCount').textContent = '1';
          document.getElementById('resultList').innerHTML = 
            '<div class="result-item error">' + data.error + '</div>';
        } else {
          const successList = data.results.success || [];
          const errorList = data.results.errors || [];

          document.getElementById('successCount').textContent = successList.length;
          document.getElementById('errorCount').textContent = errorList.length;

          let html = '';
          successList.forEach(item => {
            html += '<div class="result-item success">✅ ' + item.file + ' → ' + item.period + '</div>';
          });
          errorList.forEach(item => {
            html += '<div class="result-item error">❌ ' + item.file + ' → ' + item.error + '</div>';
          });
          document.getElementById('resultList').innerHTML = html;
        }
      } catch (err) {
        loading.style.display = 'none';
        alert('Hata: ' + err.message);
      }

      uploadBtn.disabled = false;
    });
  </script>
</body>
</html>
  `);
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    version: '3.5',
    timestamp: new Date().toISOString(),
    services: ['mail', 'mali-veri', 'admin-panel', 'accounting'],
    endpoints: [
      'POST /mail/send-code - Send OTP',
      'POST /mail/verify-otp - Verify OTP',
      'POST /mail/verify-code - Verify OTP (alias)',
      'POST /api/admin/upload-pdf - Single PDF upload',
      'POST /api/admin/upload-pdfs - Multiple PDF upload',
      'GET /api/financial-data - Get latest financial data',
      'GET /api/financial-data/:period - Get specific period data',
      'GET /api/financial-periods - Get all available periods',
      'GET /api/financial-yearly/:year - Get yearly summary',
      'POST /api/accounting/upload - Excel upload for fees',
      'GET /api/accounting/user/:userId - Get user fees',
      'GET /admin - Admin Panel',
      'GET /health - Health check',
    ]
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Yavuzel Backend API',
    version: '3.5',
    services: ['Mail API', 'Mali Veri API', 'Admin Panel', 'Accounting API'],
    message: 'Backend çalışıyor! 🚀'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
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

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ Yavuzel Backend API v3.5');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🌐 Port: ${PORT}`);
  console.log(`📧 Mail API: /mail/*`);
  console.log(`💼 Mali Veri API: /api/*`);
  console.log(`💰 Accounting API: /api/accounting/*`);
  console.log(`🔐 Admin Panel: /admin`);
  console.log('═══════════════════════════════════════════════════════════');
});
