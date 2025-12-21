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

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

// TC'yi SHA-256 ile hashle
function hashTC(tc) {
  return crypto.createHash('sha256').update(tc).digest('hex');
}

// userId'den tcHash al
async function getTcHashFromUserId(userId) {
  if (!userId) return null;
  
  const { data } = await supabase
    .from('users')
    .select('tc_vkn_hash')
    .eq('id', userId)
    .single();
  
  return data?.tc_vkn_hash || null;
}

// Decimal parse
function parseDecimal(str) {
  if (!str) return 0;
  let clean = str.replace(/[^\d.,]/g, '');
  clean = clean.replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

// PDF'ten dönem çıkar
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

// Dönem adını formatla (2025-11 -> Kasım 2025)
function formatPeriodName(period) {
  const aylar = {
    '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
    '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
    '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
  };
  const [yil, ay] = period.split('-');
  return `${aylar[ay]} ${yil}`;
}

// Önceki dönem hesapla (2025-11 -> 2025-10)
function getPreviousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// ============================================
// MÜKELLEF VERİ ÇEKME ENDPOINT'LERİ
// ============================================

// 1. MEVCUT DÖNEMLER LİSTESİ
router.get('/financial-periods', async (req, res) => {
  try {
    const { userId, tc } = req.query;
    
    // TC Hash al
    let tcHash = null;
    if (userId) {
      tcHash = await getTcHashFromUserId(userId);
    } else if (tc) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    }
    
    // Tüm dönemleri çek
    const { data, error } = await supabase
      .from('financial_statements')
      .select('period')
      .eq('tc_kimlik_no_hash', tcHash)
      .order('period', { ascending: false });
    
    if (error) {
      console.error('❌ DB Error:', error.message);
      return res.status(500).json({ success: false, error: 'DB hatası' });
    }
    
    if (!data || data.length === 0) {
      return res.json({ success: true, periods: [], years: [] });
    }
    
    // Dönemleri ve yılları çıkar
    const periods = data.map(d => d.period);
    const yearsSet = new Set(periods.map(p => parseInt(p.split('-')[0])));
    const years = Array.from(yearsSet).sort((a, b) => b - a);
    
    // Dönem detayları (UI için)
    const periodDetails = periods.map(p => ({
      value: p,
      label: formatPeriodName(p)
    }));
    
    console.log(`✅ Dönemler: ${periods.length} adet, Yıllar: ${years.join(', ')}`);
    
    res.json({
      success: true,
      periods: periodDetails,
      years
    });
    
  } catch (err) {
    console.error('❌ Financial Periods Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. BELİRLİ DÖNEM VERİSİ
router.get('/financial-data/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { userId, tc } = req.query;
    
    // Dönem formatı kontrolü (YYYY-MM)
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ success: false, error: 'Geçersiz dönem formatı (YYYY-MM)' });
    }
    
    // TC Hash al
    let tcHash = null;
    if (userId) {
      tcHash = await getTcHashFromUserId(userId);
    } else if (tc) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    }
    
    // Veriyi çek
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .eq('period', period)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      console.error('❌ DB Error:', error.message);
      return res.status(500).json({ success: false, error: 'DB hatası' });
    }
    
    if (!data) {
      return res.json({ success: false, message: 'Bu dönem için veri yok' });
    }
    
    // Net kalan hesapla
    const netKalan = data.matrah_toplami - data.alis_gider_bedel;
    
    console.log(`✅ Dönem verisi: ${period}`);
    
    res.json({
      success: true,
      data: {
        period: data.period,
        periodName: formatPeriodName(data.period),
        hasilat: data.matrah_toplami,
        alisGider: data.alis_gider_bedel,
        netKalan: netKalan,
        devredenKDV: data.devreden_kdv,
        pos: data.pos_tahsilat
      }
    });
    
  } catch (err) {
    console.error('❌ Financial Data Period Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. YILLIK ÖZET VE TÜM AYLAR
router.get('/financial-yearly/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const { userId, tc } = req.query;
    
    // Yıl formatı kontrolü
    if (!year || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ success: false, error: 'Geçersiz yıl formatı (YYYY)' });
    }
    
    // TC Hash al
    let tcHash = null;
    if (userId) {
      tcHash = await getTcHashFromUserId(userId);
    } else if (tc) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    }
    
    // Yıla ait tüm dönemleri çek
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .gte('period', `${year}-01`)
      .lte('period', `${year}-12`)
      .order('period', { ascending: true });
    
    if (error) {
      console.error('❌ DB Error:', error.message);
      return res.status(500).json({ success: false, error: 'DB hatası' });
    }
    
    if (!data || data.length === 0) {
      return res.json({ 
        success: false, 
        message: `${year} yılı için veri yok` 
      });
    }
    
    // Toplamları hesapla
    let toplamCiro = 0;
    let toplamGider = 0;
    let toplamPOS = 0;
    
    const monthly = data.map(record => {
      toplamCiro += record.matrah_toplami || 0;
      toplamGider += record.alis_gider_bedel || 0;
      toplamPOS += record.pos_tahsilat || 0;
      
      const netKalan = record.matrah_toplami - record.alis_gider_bedel;
      
      return {
        period: record.period,
        periodName: formatPeriodName(record.period),
        ay: parseInt(record.period.split('-')[1]),
        hasilat: record.matrah_toplami,
        alisGider: record.alis_gider_bedel,
        netKalan: netKalan,
        devredenKDV: record.devreden_kdv,
        pos: record.pos_tahsilat
      };
    });
    
    // Önceki aya göre değişim hesapla
    for (let i = 1; i < monthly.length; i++) {
      const current = monthly[i];
      const previous = monthly[i - 1];
      
      if (previous.hasilat > 0) {
        current.ciroChange = ((current.hasilat - previous.hasilat) / previous.hasilat * 100).toFixed(1);
      }
      if (previous.alisGider > 0) {
        current.giderChange = ((current.alisGider - previous.alisGider) / previous.alisGider * 100).toFixed(1);
      }
    }
    
    const netKalanToplam = toplamCiro - toplamGider;
    const karMarji = toplamCiro > 0 ? ((netKalanToplam / toplamCiro) * 100).toFixed(1) : 0;
    
    console.log(`✅ Yıllık rapor: ${year}, ${data.length} ay`);
    
    res.json({
      success: true,
      year: parseInt(year),
      summary: {
        toplamCiro,
        toplamGider,
        netKalan: netKalanToplam,
        toplamPOS,
        karMarji: parseFloat(karMarji),
        aylikOrtalamaCiro: Math.round(toplamCiro / data.length),
        aylikOrtalamaGider: Math.round(toplamGider / data.length),
        kayitliAySayisi: data.length
      },
      monthly
    });
    
  } catch (err) {
    console.error('❌ Financial Yearly Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. EN SON DÖNEM VERİSİ (Mevcut - güncellendi)
router.get('/financial-data', async (req, res) => {
  try {
    const { userId, tc } = req.query;
    
    // TC Hash al
    let tcHash = null;
    if (userId) {
      tcHash = await getTcHashFromUserId(userId);
    } else if (tc) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    }
    
    // En son dönemi çek
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .order('period', { ascending: false })
      .limit(1);
    
    if (error) {
      console.error('❌ DB Error:', error.message);
      return res.status(500).json({ success: false, error: 'DB hatası' });
    }
    
    if (!data || data.length === 0) {
      return res.json({ success: false, message: 'Veri yok' });
    }
    
    const record = data[0];
    const netKalan = record.matrah_toplami - record.alis_gider_bedel;
    
    // Bir önceki dönemi çek (değişim hesabı için)
    const prevPeriod = getPreviousPeriod(record.period);
    const { data: prevData } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .eq('period', prevPeriod)
      .single();
    
    let ciroChange = null;
    let giderChange = null;
    
    if (prevData) {
      if (prevData.matrah_toplami > 0) {
        ciroChange = ((record.matrah_toplami - prevData.matrah_toplami) / prevData.matrah_toplami * 100).toFixed(1);
      }
      if (prevData.alis_gider_bedel > 0) {
        giderChange = ((record.alis_gider_bedel - prevData.alis_gider_bedel) / prevData.alis_gider_bedel * 100).toFixed(1);
      }
    }
    
    console.log(`✅ En son dönem: ${record.period}`);
    
    res.json({
      success: true,
      data: {
        period: record.period,
        periodName: formatPeriodName(record.period),
        hasilat: record.matrah_toplami,
        alisGider: record.alis_gider_bedel,
        netKalan: netKalan,
        devredenKDV: record.devreden_kdv,
        pos: record.pos_tahsilat,
        ciroChange: ciroChange ? parseFloat(ciroChange) : null,
        giderChange: giderChange ? parseFloat(giderChange) : null
      }
    });
    
  } catch (err) {
    console.error('❌ Financial Data Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================
// PDF UPLOAD ENDPOINT'LERİ (Değişmedi)
// ============================================

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
    
    console.log(`📥 ${req.files.length} PDF yükleniyor...`);
    
    const results = { success: [], errors: [] };
    
    for (const file of req.files) {
      try {
        const pdfData = await pdfParse(file.buffer);
        const rawText = pdfData.text;
        const cleanText = rawText.replace(/\s+/g, ' ');
        
        const tcMatch = cleanText.match(/Vergi Kimlik Numarası[^\d]*(\d{11})/);
        const tc = tcMatch ? tcMatch[1] : null;
        if (!tc) { 
          results.errors.push({ file: file.originalname, error: 'TC bulunamadı' }); 
          continue; 
        }
        
        const tcHash = hashTC(tc);
        
        const period = extractPeriod(rawText);
        if (!period) { 
          results.errors.push({ file: file.originalname, error: 'Dönem bulunamadı' }); 
          continue; 
        }
        
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
    
    const tcHash = hashTC(tc);
    
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

module.exports = router;
