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

app.use('/mail', mailRoutes);
app.use('/api', maliRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    version: '3.3',
    timestamp: new Date().toISOString(),
    services: ['mail', 'mali-veri'],
    endpoints: [
      'POST /mail/send-code - Send OTP',
      'POST /mail/verify-otp - Verify OTP',
      'POST /mail/verify-code - Verify OTP (alias)',
      'POST /api/admin/upload-pdf - Single PDF upload',
      'POST /api/admin/upload-pdfs - Multiple PDF upload',
      'GET /api/financial-data - Get financial data',
      'GET /health - Health check',
    ]
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'Yavuzel Backend API',
    version: '3.3',
    services: ['Mail API', 'Mali Veri API'],
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
  console.log('✅ Yavuzel Backend API v3.3');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🌐 Port: ${PORT}`);
  console.log(`📧 Mail API: /mail/*`);
  console.log(`💼 Mali Veri API: /api/*`);
  console.log('═══════════════════════════════════════════════════════════');
});
