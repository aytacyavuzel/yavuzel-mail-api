const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const pdfParse = require('pdf-parse');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Sadece PDF!'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// TC'yi SHA-256 ile hashle
function hashTC(tc) {
  return crypto.createHash('sha256').update(tc).digest('hex');
}

function parseDecimal(str) {
  if (!str) return 0;
  let clean = str.replace(/[^\d.,]/g, '');
  clean = clean.replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

function extractPeriod(text) {
  const ayMap = {
    'Ocak': '01', 'Şubat': '02', 'Mart': '03', 'Nisan': '04',
    'Mayıs': '05', 'Haziran': '06', 'Temmuz': '07', 'Ağustos': '08',
    'Eylül': '09', 'Ekim': '10', 'Kasım': '11', 'Aralık': '12',
    'OCAK': '01', 'ŞUBAT': '02', 'MART': '03', 'NİSAN': '04',
    'MAYIS': '05', 'HAZİRAN': '06', 'TEMMUZ': '07', 'AĞUSTOS': '08',
    'EYLÜL': '09', 'EKİM': '10', 'KASIM': '11', 'ARALIK': '12'
  };
  const yilMatch = text.match(/(202[0-9])/);
  const yil = yilMatch ? yilMatch[1] : null;
  let ay = null;
  const ayKeys = Object.keys(ayMap);
  for (const ayIsmi of ayKeys) {
    if (text.includes(ayIsmi)) {
      ay = ayMap[ayIsmi];
      break;
    }
  }
  if (yil && ay) return `${yil}-${ay}`;
  return null;
}

// TOPLU PDF UPLOAD (TC Hashli)
router.post('/admin/upload-pdfs', upload.array('pdfs', 200), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Yetkisiz!' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'PDF yok!' });
    }
    
    console.log(`📥 ${req.files.length} PDF yükleniyor...`);
    
    const results = { success: [], errors: [] };
    
    for (const file of req.files) {
      try {
        const pdfData = await pdfParse(file.buffer);
        const rawText = pdfData.text;
        const cleanText = rawText.replace(/\s+/g, ' ');
        
        // TC çıkar
        const tcMatch = cleanText.match(/Vergi Kimlik Numarası[^\d]*(\d{11})/);
        const tc = tcMatch ? tcMatch[1] : null;
        if (!tc) { 
          results.errors.push({ file: file.originalname, error: 'TC bulunamadı' }); 
          continue; 
        }
        
        // TC'yi hashle
        const tcHash = hashTC(tc);
        
        // Dönem çıkar
        const period = extractPeriod(rawText);
        if (!period) { 
          results.errors.push({ file: file.originalname, error: 'Dönem bulunamadı' }); 
          continue; 
        }
        
        // Matrah (Hasılat)
        const matrahMatch = cleanText.match(/Matrah Toplamı\s*([\d.,]+)/);
        const matrah = matrahMatch ? parseDecimal(matrahMatch[1]) : 0;
        
        // Alış + Gider
        let alisGider = 0;
        const idx = rawText.indexOf("Alınan Mal ve Hizmete Ait Bedel");
        if (idx !== -1) {
          const sub = rawText.substring(idx, idx + 600).replace(/\s+/g, '');
          const matches = [...sub.matchAll(/(1|8|10|18|20)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/g)];
          matches.forEach(m => alisGider += parseDecimal(m[2]));
        }
        
        // Devreden KDV
        const devredenMatch = cleanText.match(/Sonraki Döneme Devreden Katma Değer Vergisi\s*([\d.,]+)/);
        const devreden = devredenMatch ? parseDecimal(devredenMatch[1]) : 0;
        
        // POS
        const posMatch = cleanText.match(/Kredi Kartı İle Tahsil[^\d]*([\d.,]+)/);
        const pos = posMatch ? parseDecimal(posMatch[1]) : 0;
        
        // Supabase'e kaydet (tc_kimlik_no_hash kullan)
        const { error } = await supabase.from('financial_statements').upsert({
          tc_kimlik_no_hash: tcHash,
          period,
          matrah_toplami: matrah,
          alis_gider_bedel: alisGider,
          devreden_kdv: devreden,
          pos_tahsilat: pos,
          pdf_filename: file.originalname,
          processed_at: new Date().toISOString()
        }, { onConflict: 'tc_kimlik_no_hash,period' });
        
        if (error) {
          console.error(`❌ DB Error: ${file.originalname}`, error.message);
          results.errors.push({ file: file.originalname, error: error.message });
        } else {
          console.log(`✅ ${file.originalname} → ${period}`);
          results.success.push({ file: file.originalname, period });
        }
        
      } catch (err) { 
        console.error(`❌ Parse Error: ${file.originalname}`, err.message);
        results.errors.push({ file: file.originalname, error: err.message }); 
      }
    }
    
    console.log(`📊 Sonuç: ${results.success.length} başarılı, ${results.errors.length} hatalı`);
    res.json({ success: true, results });
    
  } catch (error) { 
    console.error('❌ Upload Error:', error.message);
    res.status(500).json({ error: error.message }); 
  }
});

// TEK PDF UPLOAD (TC Hashli)
router.post('/admin/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz' });
    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
    
    const pdfData = await pdfParse(req.file.buffer);
    const rawText = pdfData.text;
    const cleanText = rawText.replace(/\s+/g, ' ');
    
    // TC çıkar ve hashle
    const tcMatch = cleanText.match(/Vergi Kimlik Numarası[^\d]*(\d{11})/);
    const tc = tcMatch ? tcMatch[1] : null;
    if (!tc) return res.status(400).json({ error: 'TC bulunamadı' });
    
    const tcHash = hashTC(tc);
    
    // Dönem
    const period = extractPeriod(rawText);
    if (!period) return res.status(400).json({ error: 'Dönem bulunamadı' });
    
    // Matrah
    const matrahMatch = cleanText.match(/Matrah Toplamı\s*([\d.,]+)/);
    const matrah = matrahMatch ? parseDecimal(matrahMatch[1]) : 0;
    
    // Alış + Gider
    let alisGider = 0;
    const idx = rawText.indexOf("Alınan Mal ve Hizmete Ait Bedel");
    if (idx !== -1) {
      const sub = rawText.substring(idx, idx + 600).replace(/\s+/g, '');
      const matches = [...sub.matchAll(/(1|8|10|18|20)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/g)];
      matches.forEach(m => alisGider += parseDecimal(m[2]));
    }
    
    // Devreden KDV
    const devredenMatch = cleanText.match(/Sonraki Döneme Devreden Katma Değer Vergisi\s*([\d.,]+)/);
    const devreden = devredenMatch ? parseDecimal(devredenMatch[1]) : 0;
    
    // POS
    const posMatch = cleanText.match(/Kredi Kartı İle Tahsil[^\d]*([\d.,]+)/);
    const pos = posMatch ? parseDecimal(posMatch[1]) : 0;
    
    // Supabase'e kaydet
    const { error } = await supabase.from('financial_statements').upsert({
      tc_kimlik_no_hash: tcHash,
      period,
      matrah_toplami: matrah,
      alis_gider_bedel: alisGider,
      devreden_kdv: devreden,
      pos_tahsilat: pos,
      pdf_filename: req.file.originalname,
      processed_at: new Date().toISOString()
    }, { onConflict: 'tc_kimlik_no_hash,period' });
    
    if (error) return res.status(500).json({ error: error.message });
    
    console.log(`✅ Tek PDF: ${req.file.originalname} → ${period}`);
    res.json({ success: true, data: { period, matrah, alisGider, devreden, pos } });
    
  } catch (err) { 
    console.error('❌ Tek PDF Error:', err.message);
    res.status(500).json({ error: err.message }); 
  }
});

// MÜKELLEF VERİ ÇEK (Hash ile eşleştirme)
router.get('/financial-data', async (req, res) => {
  try {
    let { tc, userId } = req.query;
    let tcHash = null;
    
    // userId varsa users tablosundan tc_vkn_hash al
    if (userId) {
      const { data } = await supabase
        .from('users')
        .select('tc_vkn_hash')
        .eq('id', userId)
        .single();
      
      if (data && data.tc_vkn_hash) {
        tcHash = data.tc_vkn_hash;
      }
    }
    
    // tc parametresi varsa hashle
    if (tc && !tcHash) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ error: 'TC veya UserID gerekli' });
    }
    
    // financial_statements'tan veri çek
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .order('period', { ascending: false })
      .limit(1);
    
    if (error) return res.status(500).json({ error: 'DB hatası' });
    if (!data || data.length === 0) return res.json({ success: false, message: 'Veri yok' });
    
    const record = data[0];
    
    res.json({
      success: true,
      data: {
        hasilat: record.matrah_toplami,
        alisGider: record.alis_gider_bedel,
        devredenKDV: record.devreden_kdv,
        pos: record.pos_tahsilat,
        period: record.period
      }
    });
    
  } catch (err) { 
    console.error('❌ Financial Data Error:', err.message);
    res.status(500).json({ error: err.message }); 
  }
});

module.exports = router;
