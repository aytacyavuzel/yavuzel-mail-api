/**
 * ═══════════════════════════════════════════════════════════════════════════
 * YAVUZEL MALİ VERİ API - v6.0
 * KDV-1 Beyannamesi Parse Sistemi - Claude AI Edition
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Claude Haiku 4 ile PDF parse - %99.9 güvenilir
 * 
 * Mantık:
 * - PDF'i base64'e çevir
 * - Claude'a gönder, ham değerleri JSON olarak al
 * - Hesaplamaları backend'de yap (LLM matematik hatası riski yok)
 * - Validation ile doğrula
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

// ═══════════════════════════════════════════════════════════════════════════
// CLIENT SETUP
// ═══════════════════════════════════════════════════════════════════════════

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Sadece PDF dosyası kabul edilir!'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ═══════════════════════════════════════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════════════════════════════════

function hashTC(tc) {
  return crypto.createHash('sha256').update(tc).digest('hex');
}

async function getTcHashFromUserId(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('users')
    .select('tc_vkn_hash')
    .eq('id', userId)
    .single();
  return data?.tc_vkn_hash || null;
}

/**
 * Dönem formatla: "2025-11" → "Kasım 2025"
 */
function formatPeriodName(period) {
  if (!period) return null;
  const aylar = {
    '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
    '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
    '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
  };
  const [yil, ay] = period.split('-');
  return `${aylar[ay] || ay} ${yil}`;
}

function getPreviousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  if (month === 1) return `${year - 1}-12`;
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAUDE API İLE PDF PARSE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PDF'i Claude Haiku ile parse et
 * Ham değerleri alır, hesaplama YAPMAZ
 */
async function parseWithClaude(pdfBuffer) {
  const pdfBase64 = pdfBuffer.toString('base64');
  
  const prompt = `Bu bir Türk KDV-1 Beyannamesi PDF'i. Aşağıdaki değerleri JSON formatında çıkar.

ÖNEMLİ KURALLAR:
1. Sadece PDF'te GÖRDÜĞÜN değerleri yaz
2. Hesaplama YAPMA, sadece oku
3. Sayıları Türk formatından (1.234,56) normal formata (1234.56) çevir
4. Bulamadığın değerler için 0 yaz
5. "BEYANNAMEYİ DÜZENLEYEN" bölümündeki TC'yi ALMA, mükellefin TC'sini al

ÇIKARILACAK DEĞERLER:

{
  "tc_vkn": "Mükellefin TC veya VKN numarası (10-11 hane)",
  "yil": 2025,
  "ay": 11,
  
  "matrah_toplami": "Matrah Toplamı satırındaki değer",
  "ozel_matrah_dahil_olmayan_bedel": "Özel Matrah Şekline Tabi İşlemlerde Matraha Dahil Olmayan Bedel sütunundaki değerlerin TOPLAMI",
  
  "alis_kdv_1": "Alınan Mal ve Hizmete Ait Bedel tablosunda KDV Oranı 1 satırındaki bedel",
  "alis_kdv_10": "Alınan Mal ve Hizmete Ait Bedel tablosunda KDV Oranı 10 satırındaki bedel", 
  "alis_kdv_20": "Alınan Mal ve Hizmete Ait Bedel tablosunda KDV Oranı 20 satırındaki bedel",
  
  "istisna_kdvsiz_temin_bedeli": "TAM İSTİSNA tablosundaki 'KDV Ödenmeksizin Temin Edilen Mal Bedeli' sütunundaki değerlerin TOPLAMI",
  
  "sonraki_doneme_devreden_kdv": "Sonraki Döneme Devreden Katma Değer Vergisi satırındaki değer",
  
  "pos_tahsilat": "Kredi Kartı İle Tahsil Edilen... satırındaki değer"
}

SADECE JSON DÖNDÜR, başka bir şey yazma.`;

  console.log('🤖 Claude API çağrılıyor...');
  
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: 'application/pdf',
            data: pdfBase64
          }
        },
        {
          type: 'text',
          text: prompt
        }
      ]
    }]
  });

  // Response'dan JSON'ı çıkar
  const responseText = response.content[0].text;
  console.log('📄 Claude yanıtı:', responseText);
  
  // JSON parse et (bazen markdown code block içinde gelebilir)
  let jsonStr = responseText;
  if (responseText.includes('```')) {
    const match = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) jsonStr = match[1];
  }
  
  const parsed = JSON.parse(jsonStr.trim());
  return parsed;
}

/**
 * Claude'dan gelen ham veriyi işle ve hesapla
 */
function processClaudeResponse(raw) {
  // Sayıya çevir (string gelebilir)
  const toNumber = (val) => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    // String ise parse et
    const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
    return isNaN(num) ? 0 : num;
  };
  
  const tc_vkn = String(raw.tc_vkn || '').replace(/\D/g, '');
  const yil = toNumber(raw.yil);
  const ay = toNumber(raw.ay);
  
  // Dönem formatı
  const period = yil && ay ? `${yil}-${String(ay).padStart(2, '0')}` : null;
  
  // Ham değerler
  const matrah_toplami = toNumber(raw.matrah_toplami);
  const ozel_matrah = toNumber(raw.ozel_matrah_dahil_olmayan_bedel);
  
  const alis_1 = toNumber(raw.alis_kdv_1);
  const alis_10 = toNumber(raw.alis_kdv_10);
  const alis_20 = toNumber(raw.alis_kdv_20);
  const istisna_alis = toNumber(raw.istisna_kdvsiz_temin_bedeli);
  
  const devreden_kdv = toNumber(raw.sonraki_doneme_devreden_kdv);
  const pos = toNumber(raw.pos_tahsilat);
  
  // HESAPLAMALAR (backend'de yapılıyor, Claude'a yaptırılmıyor)
  const ciro = matrah_toplami + ozel_matrah;
  const gider = alis_1 + alis_10 + alis_20 + istisna_alis;
  const netKalan = ciro - gider;
  
  return {
    tc: tc_vkn,
    period,
    periodName: formatPeriodName(period),
    
    // Ana değerler
    ciro,
    gider,
    netKalan,
    devredenKDV: devreden_kdv,
    pos,
    
    // Debug için ham değerler
    _raw: {
      matrah_toplami,
      ozel_matrah,
      alis_1,
      alis_10,
      alis_20,
      istisna_alis
    }
  };
}

/**
 * Validation - mantıksal kontroller
 */
function validateParsedData(data) {
  const errors = [];
  
  // TC/VKN kontrolü
  if (!data.tc || (data.tc.length !== 10 && data.tc.length !== 11)) {
    errors.push(`Geçersiz TC/VKN: ${data.tc} (${data.tc?.length} hane)`);
  }
  
  // Dönem kontrolü
  if (!data.period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(data.period)) {
    errors.push(`Geçersiz dönem: ${data.period}`);
  }
  
  // Negatif değer kontrolü
  if (data.ciro < 0) errors.push('Ciro negatif olamaz');
  if (data.gider < 0) errors.push('Gider negatif olamaz');
  if (data.devredenKDV < 0) errors.push('Devreden KDV negatif olamaz');
  if (data.pos < 0) errors.push('POS negatif olamaz');
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ANA PARSE FONKSİYONU
// ═══════════════════════════════════════════════════════════════════════════

async function parseKDVBeyanname(pdfBuffer) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔍 PDF PARSE BAŞLADI (Claude AI v6.0)');
  console.log('═══════════════════════════════════════════════════════════');
  
  // Claude ile parse et
  const rawData = await parseWithClaude(pdfBuffer);
  
  // Ham veriyi işle ve hesapla
  const processed = processClaudeResponse(rawData);
  
  // Validation
  const validation = validateParsedData(processed);
  
  console.log(`👤 TC/VKN: ${processed.tc || 'BULUNAMADI'}`);
  console.log(`📅 Dönem: ${processed.periodName || 'BULUNAMADI'}`);
  console.log(`💰 Ciro: ${processed.ciro.toLocaleString('tr-TR')} ₺`);
  console.log(`📦 Gider: ${processed.gider.toLocaleString('tr-TR')} ₺`);
  console.log(`📊 Net: ${processed.netKalan.toLocaleString('tr-TR')} ₺`);
  console.log(`🔄 Devreden KDV: ${processed.devredenKDV.toLocaleString('tr-TR')} ₺`);
  console.log(`💳 POS: ${processed.pos.toLocaleString('tr-TR')} ₺`);
  
  if (!validation.isValid) {
    console.log(`⚠️ Validation hataları: ${validation.errors.join(', ')}`);
  }
  
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return {
    ...processed,
    _validation: validation,
    _debug: { rawFromClaude: rawData }
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

router.get('/financial-periods', async (req, res) => {
  try {
    const { userId, tc } = req.query;
    let tcHash = userId ? await getTcHashFromUserId(userId) : (tc ? hashTC(tc) : null);
    if (!tcHash) return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    
    const { data, error } = await supabase
      .from('financial_statements')
      .select('period')
      .eq('tc_kimlik_no_hash', tcHash)
      .order('period', { ascending: false });
    
    if (error) return res.status(500).json({ success: false, error: 'DB hatası' });
    if (!data || data.length === 0) return res.json({ success: true, periods: [], years: [] });
    
    const periods = data.map(d => d.period);
    const years = [...new Set(periods.map(p => parseInt(p.split('-')[0])))].sort((a, b) => b - a);
    
    res.json({ 
      success: true, 
      periods: periods.map(p => ({ value: p, label: formatPeriodName(p) })), 
      years 
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/financial-data/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { userId, tc } = req.query;
    
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ success: false, error: 'Geçersiz dönem' });
    }
    
    let tcHash = userId ? await getTcHashFromUserId(userId) : (tc ? hashTC(tc) : null);
    if (!tcHash) return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .eq('period', period)
      .single();
    
    if (error && error.code !== 'PGRST116') return res.status(500).json({ success: false, error: 'DB hatası' });
    if (!data) return res.json({ success: false, message: 'Veri yok' });
    
    res.json({
      success: true,
      data: {
        period: data.period,
        periodName: formatPeriodName(data.period),
        ciro: data.ciro,
        gider: data.gider,
        netKalan: data.ciro - data.gider,
        devredenKDV: data.devreden_kdv,
        pos: data.pos_tahsilat
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/financial-yearly/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const { userId, tc } = req.query;
    
    if (!year || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ success: false, error: 'Geçersiz yıl' });
    }
    
    let tcHash = userId ? await getTcHashFromUserId(userId) : (tc ? hashTC(tc) : null);
    if (!tcHash) return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .gte('period', `${year}-01`)
      .lte('period', `${year}-12`)
      .order('period', { ascending: true });
    
    if (error) return res.status(500).json({ success: false, error: 'DB hatası' });
    if (!data || data.length === 0) return res.json({ success: false, message: 'Veri yok' });
    
    let toplamCiro = 0, toplamGider = 0, toplamPOS = 0;
    
    const monthly = data.map((r, i) => {
      toplamCiro += r.ciro || 0;
      toplamGider += r.gider || 0;
      toplamPOS += r.pos_tahsilat || 0;
      
      const result = {
        period: r.period,
        periodName: formatPeriodName(r.period),
        ay: parseInt(r.period.split('-')[1]),
        ciro: r.ciro,
        gider: r.gider,
        netKalan: r.ciro - r.gider,
        devredenKDV: r.devreden_kdv,
        pos: r.pos_tahsilat
      };
      
      if (i > 0) {
        const prev = data[i - 1];
        if (prev.ciro > 0) result.ciroChange = parseFloat(((r.ciro - prev.ciro) / prev.ciro * 100).toFixed(1));
        if (prev.gider > 0) result.giderChange = parseFloat(((r.gider - prev.gider) / prev.gider * 100).toFixed(1));
      }
      
      return result;
    });
    
    const netKalan = toplamCiro - toplamGider;
    
    res.json({
      success: true,
      year: parseInt(year),
      summary: {
        toplamCiro, toplamGider, netKalan, toplamPOS,
        karMarji: toplamCiro > 0 ? parseFloat(((netKalan / toplamCiro) * 100).toFixed(1)) : 0,
        aylikOrtalamaCiro: Math.round(toplamCiro / data.length),
        aylikOrtalamaGider: Math.round(toplamGider / data.length),
        kayitliAySayisi: data.length
      },
      monthly
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/financial-data', async (req, res) => {
  try {
    const { userId, tc } = req.query;
    let tcHash = userId ? await getTcHashFromUserId(userId) : (tc ? hashTC(tc) : null);
    if (!tcHash) return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .order('period', { ascending: false })
      .limit(1);
    
    if (error) return res.status(500).json({ success: false, error: 'DB hatası' });
    if (!data || data.length === 0) return res.json({ success: false, message: 'Veri yok' });
    
    const r = data[0];
    const prevPeriod = getPreviousPeriod(r.period);
    const { data: prevData } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .eq('period', prevPeriod)
      .single();
    
    let ciroChange = null, giderChange = null;
    if (prevData) {
      if (prevData.ciro > 0) ciroChange = parseFloat(((r.ciro - prevData.ciro) / prevData.ciro * 100).toFixed(1));
      if (prevData.gider > 0) giderChange = parseFloat(((r.gider - prevData.gider) / prevData.gider * 100).toFixed(1));
    }
    
    res.json({
      success: true,
      data: {
        period: r.period,
        periodName: formatPeriodName(r.period),
        ciro: r.ciro,
        gider: r.gider,
        netKalan: r.ciro - r.gider,
        devredenKDV: r.devreden_kdv,
        pos: r.pos_tahsilat,
        ciroChange, giderChange
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PDF UPLOAD ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

router.post('/admin/test-parse', upload.single('pdf'), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Yetkisiz!' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'PDF yok!' });
    }
    
    const startTime = Date.now();
    const parsed = await parseKDVBeyanname(req.file.buffer);
    const duration = Date.now() - startTime;
    
    res.json({
      success: true,
      filename: req.file.originalname,
      parseTime: `${duration}ms`,
      parsed: {
        tc: parsed.tc,
        period: parsed.period,
        periodName: parsed.periodName,
        ciro: parsed.ciro,
        gider: parsed.gider,
        netKalan: parsed.netKalan,
        devredenKDV: parsed.devredenKDV,
        pos: parsed.pos
      },
      validation: parsed._validation,
      debug: parsed._debug
    });
  } catch (err) {
    console.error('❌ Test Parse Error:', err);
    res.status(500).json({ error: err.message });
  }
});

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
    const startTime = Date.now();
    
    for (const file of req.files) {
      try {
        console.log(`\n📄 İşleniyor: ${file.originalname}`);
        const parsed = await parseKDVBeyanname(file.buffer);
        
        // Validation kontrolü
        if (!parsed._validation.isValid) {
          results.errors.push({ 
            file: file.originalname, 
            error: `Validation: ${parsed._validation.errors.join(', ')}` 
          });
          continue;
        }
        
        if (!parsed.tc) {
          results.errors.push({ file: file.originalname, error: 'TC bulunamadı' });
          continue;
        }
        if (!parsed.period) {
          results.errors.push({ file: file.originalname, error: 'Dönem bulunamadı' });
          continue;
        }
        
        const { error } = await supabase.from('financial_statements').upsert({
          tc_kimlik_no_hash: hashTC(parsed.tc),
          period: parsed.period,
          ciro: parsed.ciro,
          gider: parsed.gider,
          devreden_kdv: parsed.devredenKDV,
          pos_tahsilat: parsed.pos,
          pdf_filename: file.originalname,
          processed_at: new Date().toISOString()
        }, { onConflict: 'tc_kimlik_no_hash,period' });
        
        if (error) {
          results.errors.push({ file: file.originalname, error: error.message });
        } else {
          results.success.push({ 
            file: file.originalname, 
            tc: parsed.tc,
            period: parsed.periodName, 
            ciro: parsed.ciro, 
            gider: parsed.gider,
            devredenKDV: parsed.devredenKDV,
            pos: parsed.pos
          });
        }
      } catch (err) {
        results.errors.push({ file: file.originalname, error: err.message });
      }
    }
    
    const totalTime = Date.now() - startTime;
    
    res.json({ 
      success: true, 
      summary: {
        total: req.files.length,
        successful: results.success.length,
        failed: results.errors.length,
        totalTime: `${totalTime}ms`,
        avgTime: `${Math.round(totalTime / req.files.length)}ms/PDF`
      },
      results 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/admin/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: 'Yetkisiz' });
    if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
    
    const parsed = await parseKDVBeyanname(req.file.buffer);
    
    if (!parsed._validation.isValid) {
      return res.status(400).json({ 
        error: 'Validation hatası', 
        details: parsed._validation.errors 
      });
    }
    
    if (!parsed.tc) return res.status(400).json({ error: 'TC bulunamadı' });
    if (!parsed.period) return res.status(400).json({ error: 'Dönem bulunamadı' });
    
    const { error } = await supabase.from('financial_statements').upsert({
      tc_kimlik_no_hash: hashTC(parsed.tc),
      period: parsed.period,
      ciro: parsed.ciro,
      gider: parsed.gider,
      devreden_kdv: parsed.devredenKDV,
      pos_tahsilat: parsed.pos,
      pdf_filename: req.file.originalname,
      processed_at: new Date().toISOString()
    }, { onConflict: 'tc_kimlik_no_hash,period' });
    
    if (error) return res.status(500).json({ error: error.message });
    
    res.json({ success: true, data: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
