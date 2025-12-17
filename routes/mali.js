const express = require('express');
const router = express.Router();
const multer = require('multer');
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

// TOPLU PDF UPLOAD
router.post('/admin/upload-pdfs', upload.array('pdfs', 200), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Yetkisiz!' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'PDF yok!' });
    }
    const results = { success: [], errors: [] };
    for (const file of req.files) {
      try {
        const pdfData = await pdfParse(file.buffer);
        const rawText = pdfData.text;
        const cleanText = rawText.replace(/\s+/g, ' ');
        
        const tcMatch = cleanText.match(/Vergi Kimlik Numarası[^\d]*(\d{11})/);
        const tc = tcMatch ? tcMatch[1] : null;
        if (!tc) { results.errors.push({ file: file.originalname, error: 'TC bulunamadı' }); continue; }
        
        const period = extractPeriod(rawText);
        if (!period) { results.errors.push({ file: file.originalname, error: 'Dönem bulunamadı' }); continue; }
        
        const matrahMatch = cleanText.match(/Matrah Toplamı\s*([\d.,]+)/);
        const matrah = matrahMatch ? parseDecimal(matrahMatch[1]) : 0;
        
        let alisGider = 0;
        const idx = rawText.indexOf("Alınan Mal ve Hizmete Ait Bedel");
        if (idx !== -1) {
          const sub = rawText.substring(idx, idx + 600).replace(/\s+/g, '');
          const matches = [...sub.matchAll(/(1|8|10|18|20)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/g)];
          matches.forEach(m => alisGider += parseDecimal(m[2]));
        }
        
        const devredenMatch = cleanText.match(/Sonraki Döneme Devreden Katma Değer Vergisi\s*([\d.,]+)/);
        const devreden = devredenMatch ? parseDecimal(devredenMatch[1]) : 0;
        
        const posMatch = cleanText.match(/Kredi Kartı İle Tahsil[^\d]*([\d.,]+)/);
        const pos = posMatch ? parseDecimal(posMatch[1]) : 0;
        
        const { error } = await supabase.from('financial_statements').upsert({
          tc_kimlik_no: tc, period, matrah_toplami: matrah, alis_gider_bedel: alisGider,
          devreden_kdv: devreden, pos_tahsilat: pos, pdf_filename: file.originalname,
          processed_at: new Date().toISOString()
        }, { onConflict: 'tc_kimlik_no,period' });
        
        if (error) results.errors.push({ file: file.originalname, error: error.message });
        else results.success.push({ file: file.originalname, tc, period });
      } catch (err) { results.errors.push({ file: file.originalname, error: err.message }); }
    }
    res.json({ success: true, results });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// TEK PDF UPLOAD
router.post('/admin/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz' });
    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
    
    const pdfData = await pdfParse(req.file.buffer);
    const rawText = pdfData.text;
    const cleanText = rawText.replace(/\s+/g, ' ');
    
    const tcMatch = cleanText.match(/Vergi Kimlik Numarası[^\d]*(\d{11})/);
    const tc = tcMatch ? tcMatch[1] : null;
    if (!tc) return res.status(400).json({ error: 'TC bulunamadı' });
    
    const period = extractPeriod(rawText);
    if (!period) return res.status(400).json({ error: 'Dönem bulunamadı' });
    
    const matrahMatch = cleanText.match(/Matrah Toplamı\s*([\d.,]+)/);
    const matrah = matrahMatch ? parseDecimal(matrahMatch[1]) : 0;
    
    let alisGider = 0;
    const idx = rawText.indexOf("Alınan Mal ve Hizmete Ait Bedel");
    if (idx !== -1) {
      const sub = rawText.substring(idx, idx + 600).replace(/\s+/g, '');
      const matches = [...sub.matchAll(/(1|8|10|18|20)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/g)];
      matches.forEach(m => alisGider += parseDecimal(m[2]));
    }
    
    const devredenMatch = cleanText.match(/Sonraki Döneme Devreden Katma Değer Vergisi\s*([\d.,]+)/);
    const devreden = devredenMatch ? parseDecimal(devredenMatch[1]) : 0;
    
    const posMatch = cleanText.match(/Kredi Kartı İle Tahsil[^\d]*([\d.,]+)/);
    const pos = posMatch ? parseDecimal(posMatch[1]) : 0;
    
    const { error } = await supabase.from('financial_statements').upsert({
      tc_kimlik_no: tc, period, matrah_toplami: matrah, alis_gider_bedel: alisGider,
      devreden_kdv: devreden, pos_tahsilat: pos, pdf_filename: req.file.originalname,
      processed_at: new Date().toISOString()
    }, { onConflict: 'tc_kimlik_no,period' });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data: { tc, period, matrah, alisGider, devreden, pos } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// MÜKELLEF VERİ ÇEK
router.get('/financial-data', async (req, res) => {
  try {
    let { tc, userId } = req.query;
    if (!tc && userId) {
      const { data } = await supabase.from('users').select('tc_vkn').eq('id', userId).single();
      if (data && data.tc_vkn) tc = data.tc_vkn;
    }
    if (!tc) return res.status(400).json({ error: 'TC gerekli' });
    
    const { data, error } = await supabase.from('financial_statements').select('*').eq('tc_kimlik_no', tc).order('period', { ascending: false }).limit(1);
    if (error) return res.status(500).json({ error: 'DB hatası' });
    if (!data || data.length === 0) return res.json({ success: false, message: 'Veri yok' });
    
    const record = data[0];
    const hasilat = record.matrah_toplami;
    res.json({
      success: true,
      data: {
        hasilat, alisGider: record.alis_gider_bedel, devredenKDV: record.devreden_kdv,
        pos: record.pos_tahsilat, period: record.period
      }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
