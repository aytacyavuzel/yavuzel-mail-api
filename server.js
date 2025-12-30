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
// ADMIN PANELİ - PDF + EXCEL YÜKLEME ARAYÜZÜ
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
      padding: 20px;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
      padding-top: 20px;
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
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 24px;
    }
    .tab {
      flex: 1;
      padding: 14px;
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 12px;
      color: #94a3b8;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }
    .tab:hover {
      background: #334155;
    }
    .tab.active {
      background: #6366f1;
      border-color: #6366f1;
      color: white;
    }
    .panel {
      background: #1e293b;
      border-radius: 24px;
      padding: 32px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
      border: 1px solid #334155;
      display: none;
    }
    .panel.active {
      display: block;
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
    .info-box {
      background: rgba(99, 102, 241, 0.1);
      border: 1px solid rgba(99, 102, 241, 0.2);
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 20px;
    }
    .info-box h4 {
      color: #a5b4fc;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .info-box p {
      color: #94a3b8;
      font-size: 12px;
      line-height: 1.5;
    }
    .info-box code {
      background: #0f172a;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>🔐 Yavuzel Admin Panel</h1>
      <p>Veri Yükleme Sistemi</p>
    </div>

    <div class="tabs">
      <div class="tab active" onclick="switchTab('pdf')">📄 PDF Yükle</div>
      <div class="tab" onclick="switchTab('excel')">📊 Excel Yükle</div>
    </div>

    <!-- PDF PANEL -->
    <div class="panel active" id="pdfPanel">
      <div class="form-group">
        <label>Admin Şifresi</label>
        <input type="password" id="pdfPassword" placeholder="••••••••">
      </div>

      <div class="form-group">
        <label>PDF Dosyaları (Beyanname)</label>
        <div class="file-upload" id="pdfDropZone">
          <p>📄 <span>Dosya seç</span> veya sürükle bırak</p>
          <p style="margin-top: 8px; font-size: 12px;">Maksimum 200 PDF</p>
          <input type="file" id="pdfInput" multiple accept="application/pdf">
        </div>
        <div class="file-count" id="pdfCount"></div>
      </div>

      <button class="btn" id="pdfBtn" disabled>Yükle</button>

      <div class="loading" id="pdfLoading">
        <div class="spinner"></div>
        <p>PDF'ler işleniyor...</p>
      </div>

      <div class="results" id="pdfResults">
        <div class="summary">
          <div class="summary-item success">
            <div class="number" id="pdfSuccessCount">0</div>
            <div class="label">Başarılı</div>
          </div>
          <div class="summary-item error">
            <div class="number" id="pdfErrorCount">0</div>
            <div class="label">Hatalı</div>
          </div>
        </div>
        <h3>Detaylar</h3>
        <div id="pdfResultList"></div>
      </div>
    </div>

    <!-- EXCEL PANEL -->
    <div class="panel" id="excelPanel">
      <div class="info-box">
        <h4>📋 Excel Formatı</h4>
        <p>Sütunlar: <code>user_id</code>, <code>year</code>, <code>monthly_fee</code>, <code>jan_paid</code>, <code>feb_paid</code>, <code>mar_paid</code>, <code>apr_paid</code>, <code>may_paid</code>, <code>jun_paid</code>, <code>jul_paid</code>, <code>aug_paid</code>, <code>sep_paid</code>, <code>oct_paid</code>, <code>nov_paid</code>, <code>dec_paid</code></p>
        <p style="margin-top: 8px;">Ödenen aylar için tutar yaz, ödenmeyenler için boş bırak.</p>
      </div>

      <div class="form-group">
        <label>Admin Şifresi</label>
        <input type="password" id="excelPassword" placeholder="••••••••">
      </div>

      <div class="form-group">
        <label>Excel Dosyası (Muhasebe Ücretleri)</label>
        <div class="file-upload" id="excelDropZone">
          <p>📊 <span>Dosya seç</span> veya sürükle bırak</p>
          <p style="margin-top: 8px; font-size: 12px;">.xlsx veya .xls</p>
          <input type="file" id="excelInput" accept=".xlsx,.xls">
        </div>
        <div class="file-count" id="excelCount"></div>
      </div>

      <button class="btn" id="excelBtn" disabled>Yükle</button>

      <div class="loading" id="excelLoading">
        <div class="spinner"></div>
        <p>Excel işleniyor...</p>
      </div>

      <div class="results" id="excelResults">
        <div class="summary">
          <div class="summary-item success">
            <div class="number" id="excelSuccessCount">0</div>
            <div class="label">Eklenen/Güncellenen</div>
          </div>
          <div class="summary-item error">
            <div class="number" id="excelErrorCount">0</div>
            <div class="label">Hatalı</div>
          </div>
        </div>
        <div id="excelResultList"></div>
      </div>
    </div>
  </div>

  <script>
    // Tab switching
    function switchTab(tab) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      
      if (tab === 'pdf') {
        document.querySelectorAll('.tab')[0].classList.add('active');
        document.getElementById('pdfPanel').classList.add('active');
      } else {
        document.querySelectorAll('.tab')[1].classList.add('active');
        document.getElementById('excelPanel').classList.add('active');
      }
    }

    // ============================================
    // PDF UPLOAD
    // ============================================
    const pdfDropZone = document.getElementById('pdfDropZone');
    const pdfInput = document.getElementById('pdfInput');
    const pdfCount = document.getElementById('pdfCount');
    const pdfBtn = document.getElementById('pdfBtn');
    const pdfPassword = document.getElementById('pdfPassword');
    const pdfLoading = document.getElementById('pdfLoading');
    const pdfResults = document.getElementById('pdfResults');

    let pdfFiles = [];

    pdfDropZone.addEventListener('click', () => pdfInput.click());

    pdfDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      pdfDropZone.classList.add('dragover');
    });

    pdfDropZone.addEventListener('dragleave', () => {
      pdfDropZone.classList.remove('dragover');
    });

    pdfDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      pdfDropZone.classList.remove('dragover');
      handlePdfFiles(e.dataTransfer.files);
    });

    pdfInput.addEventListener('change', (e) => {
      handlePdfFiles(e.target.files);
    });

    function handlePdfFiles(files) {
      pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf');
      if (pdfFiles.length > 0) {
        pdfCount.style.display = 'block';
        pdfCount.textContent = pdfFiles.length + ' PDF seçildi';
        pdfBtn.disabled = false;
      } else {
        pdfCount.style.display = 'none';
        pdfBtn.disabled = true;
      }
    }

    pdfBtn.addEventListener('click', async () => {
      if (!pdfPassword.value) {
        alert('Şifre gerekli!');
        return;
      }

      if (pdfFiles.length === 0) {
        alert('PDF seçin!');
        return;
      }

      pdfBtn.disabled = true;
      pdfLoading.style.display = 'block';
      pdfResults.style.display = 'none';

      const formData = new FormData();
      formData.append('password', pdfPassword.value);
      pdfFiles.forEach(file => formData.append('pdfs', file));

      try {
        const res = await fetch('/api/admin/upload-pdfs', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        
        pdfLoading.style.display = 'none';
        pdfResults.style.display = 'block';

        if (data.error) {
          document.getElementById('pdfSuccessCount').textContent = '0';
          document.getElementById('pdfErrorCount').textContent = '1';
          document.getElementById('pdfResultList').innerHTML = 
            '<div class="result-item error">' + data.error + '</div>';
        } else {
          const successList = data.results.success || [];
          const errorList = data.results.errors || [];

          document.getElementById('pdfSuccessCount').textContent = successList.length;
          document.getElementById('pdfErrorCount').textContent = errorList.length;

          let html = '';
          successList.forEach(item => {
            html += '<div class="result-item success">✅ ' + item.file + ' → ' + item.period + '</div>';
          });
          errorList.forEach(item => {
            html += '<div class="result-item error">❌ ' + item.file + ' → ' + item.error + '</div>';
          });
          document.getElementById('pdfResultList').innerHTML = html;
        }
      } catch (err) {
        pdfLoading.style.display = 'none';
        alert('Hata: ' + err.message);
      }

      pdfBtn.disabled = false;
    });

    // ============================================
    // EXCEL UPLOAD
    // ============================================
    const excelDropZone = document.getElementById('excelDropZone');
    const excelInput = document.getElementById('excelInput');
    const excelCount = document.getElementById('excelCount');
    const excelBtn = document.getElementById('excelBtn');
    const excelPassword = document.getElementById('excelPassword');
    const excelLoading = document.getElementById('excelLoading');
    const excelResults = document.getElementById('excelResults');

    let excelFile = null;

    excelDropZone.addEventListener('click', () => excelInput.click());

    excelDropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      excelDropZone.classList.add('dragover');
    });

    excelDropZone.addEventListener('dragleave', () => {
      excelDropZone.classList.remove('dragover');
    });

    excelDropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      excelDropZone.classList.remove('dragover');
      handleExcelFile(e.dataTransfer.files);
    });

    excelInput.addEventListener('change', (e) => {
      handleExcelFile(e.target.files);
    });

    function handleExcelFile(files) {
      const file = files[0];
      if (file && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
        excelFile = file;
        excelCount.style.display = 'block';
        excelCount.textContent = file.name;
        excelBtn.disabled = false;
      } else {
        excelCount.style.display = 'none';
        excelBtn.disabled = true;
      }
    }

    excelBtn.addEventListener('click', async () => {
      if (!excelPassword.value) {
        alert('Şifre gerekli!');
        return;
      }

      if (!excelFile) {
        alert('Excel dosyası seçin!');
        return;
      }

      excelBtn.disabled = true;
      excelLoading.style.display = 'block';
      excelResults.style.display = 'none';

      const formData = new FormData();
      formData.append('password', excelPassword.value);
      formData.append('file', excelFile);

      try {
        const res = await fetch('/api/accounting/upload', {
          method: 'POST',
          body: formData
        });

        const data = await res.json();
        
        excelLoading.style.display = 'none';
        excelResults.style.display = 'block';

        if (data.success) {
          document.getElementById('excelSuccessCount').textContent = data.inserted + data.updated;
          document.getElementById('excelErrorCount').textContent = '0';
          document.getElementById('excelResultList').innerHTML = 
            '<div class="result-item success">✅ ' + data.message + '</div>';
        } else {
          document.getElementById('excelSuccessCount').textContent = '0';
          document.getElementById('excelErrorCount').textContent = '1';
          document.getElementById('excelResultList').innerHTML = 
            '<div class="result-item error">❌ ' + data.message + '</div>';
        }
      } catch (err) {
        excelLoading.style.display = 'none';
        alert('Hata: ' + err.message);
      }

      excelBtn.disabled = false;
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
