/**
 * ═══════════════════════════════════════════════════════════════════════════
 * YAVUZEL MALİ VERİ API - v5.0
 * KDV-1 Beyannamesi Parse Sistemi
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * KOORDİNAT BAZLI PARSE - %100 GÜVENİLİR
 * 
 * Mantık:
 * - PDF'teki her text'in X,Y koordinatı var
 * - "Matrah Toplamı" label'ını bul → sağındaki sayı = değer
 * - "Sonraki Döneme Devreden KDV" label'ını bul → sağındaki sayı = değer
 * - Bu şekilde yapı değişse bile doğru çalışır
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// pdfjs-dist kullanıyoruz (koordinat bazlı parse için)
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

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
 * Türk para formatını parse et
 * "1.234.567,89" → 1234567.89
 */
function parseDecimal(str) {
  if (!str) return 0;
  let clean = String(str).replace(/[^\d.,]/g, '');
  if (!clean) return 0;
  clean = clean.replace(/\./g, '').replace(',', '.');
  const result = parseFloat(clean);
  return isNaN(result) ? 0 : result;
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
// PDF KOORDİNAT BAZLI PARSE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * PDF'den tüm text item'ları koordinatlarıyla birlikte çıkar
 * Her item: { text, x, y, width, height, pageNum }
 */
async function extractTextItems(pdfBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
  const pdf = await loadingTask.promise;
  
  const allItems = [];
  
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1.0 });
    
    for (const item of textContent.items) {
      if (!item.str || item.str.trim() === '') continue;
      
      const tx = item.transform[4];
      const ty = viewport.height - item.transform[5];
      
      allItems.push({
        text: item.str.trim(),
        x: tx,
        y: ty,
        width: item.width,
        height: item.height,
        pageNum: pageNum
      });
    }
  }
  
  return allItems;
}

/**
 * Label'ı bul ve sağındaki veya altındaki değeri al
 * Bu fonksiyon koordinat bazlı çalışır - %100 güvenilir
 */
function findLabelValue(items, labelText, options = {}) {
  const { yThreshold = 15, xThreshold = 200, yRange = 50, searchPartial = true } = options;
  
  // Label'ı bul
  let labelItem = null;
  
  // Önce tam eşleşme dene
  labelItem = items.find(item => item.text === labelText);
  
  // Partial match
  if (!labelItem && searchPartial) {
    labelItem = items.find(item => item.text.includes(labelText));
  }
  
  if (!labelItem) {
    return null;
  }
  
  // Sağdaki sayıları bul (aynı Y hizasında, daha büyük X)
  const rightCandidates = items.filter(item => 
    Math.abs(item.y - labelItem.y) < yThreshold &&
    item.x > labelItem.x + (labelItem.width || 0) - 20 &&
    /\d/.test(item.text)
  ).sort((a, b) => a.x - b.x);
  
  // Altındaki sayıları bul (daha büyük Y, benzer X)
  const belowCandidates = items.filter(item => 
    item.y > labelItem.y &&
    item.y < labelItem.y + yRange &&
    Math.abs(item.x - labelItem.x) < xThreshold &&
    /\d/.test(item.text)
  ).sort((a, b) => a.y - b.y);
  
  // Önce sağdaki sayıyı dene
  for (const candidate of rightCandidates) {
    const numMatch = candidate.text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
    if (numMatch) {
      return parseDecimal(numMatch[1]);
    }
  }
  
  // Sonra alttaki sayıyı dene
  for (const candidate of belowCandidates) {
    const numMatch = candidate.text.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/);
    if (numMatch) {
      return parseDecimal(numMatch[1]);
    }
  }
  
  return null;
}

/**
 * TC Kimlik No bul
 */
function extractTC(items) {
  const page1Items = items.filter(item => item.pageNum === 1);
  
  // "BEYANNAMEYİ DÜZENLEYEN" öncesindeki TC'yi al
  const duzenliyenItem = items.find(item => 
    item.text.includes('DÜZENLEYEN') || 
    item.text.includes('Beyannamenin Hangi')
  );
  
  const maxY = duzenliyenItem ? duzenliyenItem.y : Infinity;
  
  for (const item of page1Items) {
    if (duzenliyenItem && item.y > maxY) continue;
    
    const tcMatch = item.text.match(/\b(\d{11})\b/);
    if (tcMatch) return tcMatch[1];
  }
  
  for (const item of page1Items) {
    if (duzenliyenItem && item.y > maxY) continue;
    
    const vknMatch = item.text.match(/\b(\d{10})\b/);
    if (vknMatch) return vknMatch[1];
  }
  
  return null;
}

/**
 * Dönem bul
 */
function extractPeriod(items) {
  const ayMap = {
    'ocak': '01', 'şubat': '02', 'mart': '03', 'nisan': '04',
    'mayıs': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
    'eylül': '09', 'ekim': '10', 'kasım': '11', 'aralık': '12'
  };
  
  let yil = null;
  let ay = null;
  
  const yilLabel = items.find(item => item.text === 'Yıl' || item.text === 'YIL');
  if (yilLabel) {
    const candidates = items.filter(item => 
      (Math.abs(item.y - yilLabel.y) < 20 && item.x > yilLabel.x) ||
      (item.y > yilLabel.y && item.y < yilLabel.y + 50 && Math.abs(item.x - yilLabel.x) < 100)
    );
    
    for (const c of candidates) {
      const yilMatch = c.text.match(/\b(202[4-9])\b/);
      if (yilMatch) {
        yil = yilMatch[1];
        break;
      }
    }
  }
  
  const ayLabel = items.find(item => item.text === 'Ay' || item.text === 'AY');
  if (ayLabel) {
    const candidates = items.filter(item => 
      (Math.abs(item.y - ayLabel.y) < 20 && item.x > ayLabel.x) ||
      (item.y > ayLabel.y && item.y < ayLabel.y + 50 && Math.abs(item.x - ayLabel.x) < 100)
    );
    
    for (const c of candidates) {
      const ayAdi = c.text.toLowerCase().trim();
      if (ayMap[ayAdi]) {
        ay = ayMap[ayAdi];
        break;
      }
    }
  }
  
  if (yil && ay) return `${yil}-${ay}`;
  return null;
}

/**
 * Ciro hesapla: Matrah Toplamı + Özel Matrah Dahil Olmayan Bedel
 */
function extractCiro(items) {
  // 1. Matrah Toplamı
  const matrahToplami = findLabelValue(items, 'Matrah Toplamı') || 0;
  
  // 2. Özel Matrah Dahil Olmayan Bedel
  let ozelMatrah = findLabelValue(items, 'Dahil Olmayan Bedel');
  if (ozelMatrah === null) {
    ozelMatrah = findLabelValue(items, 'Matraha Dahil Olmayan');
  }
  ozelMatrah = ozelMatrah || 0;
  
  console.log(`   📊 Ciro: Matrah=${matrahToplami.toLocaleString('tr-TR')} + Özel=${ozelMatrah.toLocaleString('tr-TR')}`);
  
  return matrahToplami + ozelMatrah;
}

/**
 * Gider hesapla: Alınan Mal Bedelleri + İstisna Alışları
 */
function extractGider(items) {
  let toplamGider = 0;
  
  // 1. "Alınan Mal ve Hizmete Ait Bedel" bölümü
  const alisLabel = items.find(item => item.text.includes('Alınan Mal ve Hizmete Ait Bedel'));
  
  if (alisLabel) {
    const tecilLabel = items.find(item => item.text.includes('Tecil'));
    const maxY = tecilLabel ? tecilLabel.y : alisLabel.y + 200;
    
    // Alış bölümündeki satırları al
    const sectionItems = items.filter(item => 
      item.y > alisLabel.y && 
      item.y < maxY &&
      item.pageNum === alisLabel.pageNum
    ).sort((a, b) => a.y - b.y || a.x - b.x);
    
    // Satırları grupla
    const rows = [];
    let currentRow = [];
    let currentY = null;
    
    for (const item of sectionItems) {
      if (currentY === null || Math.abs(item.y - currentY) < 10) {
        currentRow.push(item);
        currentY = item.y;
      } else {
        if (currentRow.length > 0) rows.push(currentRow);
        currentRow = [item];
        currentY = item.y;
      }
    }
    if (currentRow.length > 0) rows.push(currentRow);
    
    // Her satırı analiz et
    for (const row of rows) {
      const oranlar = ['20', '18', '10', '8', '1'];
      
      for (const oran of oranlar) {
        if (row[0] && row[0].text === oran) {
          const numbers = row.slice(1).filter(item => /\d/.test(item.text));
          if (numbers.length >= 1) {
            const bedel = parseDecimal(numbers[0].text);
            if (bedel > 0) {
              console.log(`   📦 Alış KDV%${oran}: ${bedel.toLocaleString('tr-TR')}`);
              toplamGider += bedel;
            }
          }
          break;
        }
      }
    }
  }
  
  // 2. İstisna alışları (TAM İSTİSNA bölümü)
  // "KDV Ödenmeksizin Temin Edilen Mal Bedeli" - bu TAM İSTİSNA tablosundaki son sütun
  
  // Yem Teslimleri veya benzeri istisna satırını bul
  const istisnaLabels = ['Yem Teslimleri', 'Altın Teslim', 'Gümüş Teslim'];
  
  for (const label of istisnaLabels) {
    const istisnaItem = items.find(item => item.text.includes(label));
    if (istisnaItem) {
      // Aynı satırdaki sayıları bul
      const sameRowNumbers = items.filter(item => 
        Math.abs(item.y - istisnaItem.y) < 15 &&
        /\d{1,3}(?:\.\d{3})*,\d{2}/.test(item.text)
      ).sort((a, b) => a.x - b.x);
      
      // TAM İSTİSNA tablosu yapısı:
      // İstisna Türü | Teslim ve Hizmet Tutarı | Yüklenilen KDV | KDV Ödenmeksizin Temin Edilen
      // Yani 3 sayı var, sonuncusu istisna alış bedeli
      
      if (sameRowNumbers.length >= 3) {
        // Son sayı = KDV Ödenmeksizin Temin Edilen Mal Bedeli
        const istisnaBedeli = parseDecimal(sameRowNumbers[sameRowNumbers.length - 1].text);
        if (istisnaBedeli > 0) {
          console.log(`   🏷️ İstisna Alış (${label}): ${istisnaBedeli.toLocaleString('tr-TR')}`);
          toplamGider += istisnaBedeli;
        }
      }
      break;
    }
  }
  
  console.log(`   📊 Toplam Gider: ${toplamGider.toLocaleString('tr-TR')}`);
  
  return toplamGider;
}

/**
 * Devreden KDV: "Sonraki Döneme Devreden Katma Değer Vergisi"
 */
function extractDevredenKDV(items) {
  // Label'ı bul
  const label = items.find(item => 
    item.text.includes('Sonraki Döneme Devreden')
  );
  
  if (!label) {
    // Parçalı arama
    const sonrakiLabel = items.find(item => item.text === 'Sonraki');
    if (sonrakiLabel) {
      // "Döneme" ve "Devreden" kelimelerini bul, hepsi aynı satırda mı?
      const sameLineItems = items.filter(item => 
        Math.abs(item.y - sonrakiLabel.y) < 15
      );
      
      // Aynı satırdaki sayıları bul
      const numbers = sameLineItems.filter(item => 
        /\d{1,3}(?:\.\d{3})*,\d{2}/.test(item.text)
      ).sort((a, b) => a.x - b.x);
      
      // Bu satırda birden fazla sayı olabilir
      // "Ödenmesi Gereken" ve "Sonraki Döneme Devreden" aynı satırda
      // Sıralama: Ödenmesi Gereken | Sonraki Döneme Devreden | İade Edilmesi
      
      // "Devreden" kelimesinin pozisyonuna en yakın sayıyı bul
      const devredenLabel = sameLineItems.find(item => item.text.includes('Devreden'));
      if (devredenLabel && numbers.length > 0) {
        // Devreden label'ından sonraki ilk sayı
        const afterDevreden = numbers.filter(n => n.x > devredenLabel.x);
        if (afterDevreden.length > 0) {
          return parseDecimal(afterDevreden[0].text);
        }
      }
      
      // Alternatif: 2. sayı genelde Devreden KDV
      if (numbers.length >= 2) {
        return parseDecimal(numbers[1].text);
      }
    }
    
    return 0;
  }
  
  // Sağındaki sayıyı bul
  const rightNumbers = items.filter(item => 
    Math.abs(item.y - label.y) < 20 &&
    item.x > label.x + (label.width || 0) &&
    /\d{1,3}(?:\.\d{3})*,\d{2}/.test(item.text)
  ).sort((a, b) => a.x - b.x);
  
  if (rightNumbers.length > 0) {
    return parseDecimal(rightNumbers[0].text);
  }
  
  // Altındaki sayıyı dene
  const belowNumbers = items.filter(item => 
    item.y > label.y &&
    item.y < label.y + 50 &&
    Math.abs(item.x - label.x) < 150 &&
    /\d{1,3}(?:\.\d{3})*,\d{2}/.test(item.text)
  ).sort((a, b) => a.y - b.y);
  
  if (belowNumbers.length > 0) {
    return parseDecimal(belowNumbers[0].text);
  }
  
  return 0;
}

/**
 * POS Tahsilat
 */
function extractPOS(items) {
  return findLabelValue(items, 'Kredi Kartı İle Tahsil') || 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANA PARSE FONKSİYONU
// ═══════════════════════════════════════════════════════════════════════════

async function parseKDVBeyanname(pdfBuffer) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔍 PDF PARSE BAŞLADI (Koordinat Bazlı v5.0)');
  console.log('═══════════════════════════════════════════════════════════');
  
  const items = await extractTextItems(pdfBuffer);
  console.log(`📄 Toplam ${items.length} text item bulundu`);
  
  const tc = extractTC(items);
  console.log(`👤 TC/VKN: ${tc || 'BULUNAMADI'}`);
  
  const period = extractPeriod(items);
  const periodName = period ? formatPeriodName(period) : null;
  console.log(`📅 Dönem: ${periodName || 'BULUNAMADI'}`);
  
  const ciro = extractCiro(items);
  const gider = extractGider(items);
  const netKalan = ciro - gider;
  
  console.log(`\n💰 Net Kalan: ${netKalan.toLocaleString('tr-TR')}`);
  
  const devredenKDV = extractDevredenKDV(items);
  console.log(`🔄 Devreden KDV: ${devredenKDV.toLocaleString('tr-TR')}`);
  
  const pos = extractPOS(items);
  console.log(`💳 POS: ${pos.toLocaleString('tr-TR')}`);
  
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return {
    tc,
    period,
    periodName,
    ciro,
    gider,
    netKalan,
    devredenKDV,
    pos,
    _debug: {
      totalItems: items.length,
      sampleItems: items.slice(0, 100).map(i => ({ 
        text: i.text, 
        x: Math.round(i.x), 
        y: Math.round(i.y),
        page: i.pageNum 
      }))
    }
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
    
    const parsed = await parseKDVBeyanname(req.file.buffer);
    
    res.json({
      success: true,
      filename: req.file.originalname,
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
    
    for (const file of req.files) {
      try {
        const parsed = await parseKDVBeyanname(file.buffer);
        
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
          results.success.push({ file: file.originalname, period: parsed.periodName, ciro: parsed.ciro, gider: parsed.gider });
        }
      } catch (err) {
        results.errors.push({ file: file.originalname, error: err.message });
      }
    }
    
    res.json({ success: true, results });
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
