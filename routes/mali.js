/**
 * ═══════════════════════════════════════════════════════════════════════════
 * YAVUZEL MALİ VERİ API - v4.0
 * KDV-1 Beyannamesi Parse Sistemi
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Desteklenen Mükellef Tipleri:
 * - Standart Ticaret (normal KDV1)
 * - Yem Satıcıları (325 kodu - istisna)
 * - Kuyumcular (özel matrah)
 * - Tüm diğer meslek grupları
 * 
 * Parse Edilen Alanlar:
 * - TC Kimlik No / VKN (mükellefin, mali müşavirin DEĞİL)
 * - Dönem (Yıl + Ay)
 * - Ciro (Matrah Toplamı + Özel Matrah Dahil Olmayan Bedel)
 * - Gider (Alış Bedelleri + İstisna Alışları)
 * - Devreden KDV
 * - POS Tahsilat
 * 
 * ═══════════════════════════════════════════════════════════════════════════
 */

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
      cb(new Error('Sadece PDF dosyası kabul edilir!'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ═══════════════════════════════════════════════════════════════════════════
// YARDIMCI FONKSİYONLAR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TC/VKN'yi SHA-256 ile hashle
 */
function hashTC(tc) {
  return crypto.createHash('sha256').update(tc).digest('hex');
}

/**
 * userId'den tcHash al
 */
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
 * "15.727.732,74" → 15727732.74
 */
function parseDecimal(str) {
  if (!str) return 0;
  
  // String'e çevir
  str = String(str);
  
  // Sadece rakam, nokta ve virgül bırak
  let clean = str.replace(/[^\d.,]/g, '');
  
  if (!clean) return 0;
  
  // Türk formatı: noktalar binlik ayracı, virgül ondalık
  // 1.234.567,89 → 1234567.89
  clean = clean.replace(/\./g, '').replace(',', '.');
  
  const result = parseFloat(clean);
  return isNaN(result) ? 0 : result;
}

/**
 * Dönem adını formatla
 * "2025-11" → "Kasım 2025"
 */
function formatPeriodName(period) {
  if (!period) return null;
  
  const aylar = {
    '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
    '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
    '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
  };
  
  const parts = period.split('-');
  if (parts.length !== 2) return period;
  
  const [yil, ay] = parts;
  return `${aylar[ay] || ay} ${yil}`;
}

/**
 * Önceki dönemi hesapla
 * "2025-11" → "2025-10"
 * "2025-01" → "2024-12"
 */
function getPreviousPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  if (month === 1) {
    return `${year - 1}-12`;
  }
  return `${year}-${String(month - 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF PARSE FONKSİYONLARI
// ═══════════════════════════════════════════════════════════════════════════

/**
 * TC Kimlik No / VKN Çıkarma
 * ÖNEMLİ: Mükellefin TC'sini alır, Mali Müşavirin DEĞİL!
 * 
 * PDF yapısı:
 * - Sayfa 1 üst kısım: Mükellef bilgileri (BU ALINACAK)
 * - Sayfa son: "BEYANNAMEYİ DÜZENLEYEN" = Mali Müşavir (ATLANACAK)
 */
function extractTC(rawText) {
  // "BEYANNAMEYİ DÜZENLEYEN" bölümünü bul ve öncesini al
  const patterns = [
    /BEYANNAME[Yİ]*\s*D[ÜU]ZENLEYEN/i,
    /DÜZENLEYEN/i,
    /Beyannamenin Hangi S[ıi]fatla/i
  ];
  
  let cutIndex = rawText.length;
  for (const pattern of patterns) {
    const match = rawText.search(pattern);
    if (match > 0 && match < cutIndex) {
      cutIndex = match;
    }
  }
  
  // Sadece mükellef bilgilerinin olduğu kısımda ara
  const searchArea = rawText.substring(0, cutIndex);
  
  // 11 haneli TC Kimlik No bul
  const tc11Matches = searchArea.match(/\b(\d{11})\b/g);
  if (tc11Matches && tc11Matches.length > 0) {
    // İlk bulunan 11 haneli = Mükellef TC
    return tc11Matches[0];
  }
  
  // 10 haneli VKN bul (şirketler için)
  const tc10Matches = searchArea.match(/\b(\d{10})\b/g);
  if (tc10Matches && tc10Matches.length > 0) {
    return tc10Matches[0];
  }
  
  return null;
}

/**
 * Dönem Çıkarma (Yıl + Ay)
 * 
 * PDF yapısı farklı olabilir:
 * Yıl     2025
 * Ay      Kasım
 * 
 * veya:
 * Yıl
 * Ay
 * 2025
 * Kasım
 */
function extractPeriod(rawText) {
  const ayMap = {
    'ocak': '01', 'şubat': '02', 'mart': '03', 'nisan': '04',
    'mayıs': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
    'eylül': '09', 'ekim': '10', 'kasım': '11', 'aralık': '12'
  };
  
  let yil = null;
  let ay = null;
  
  // Satır satır analiz et
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l);
  
  // Yöntem 1: "Yıl" satırından sonraki satırlarda 4 haneli yıl ara
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // "Yıl" kelimesini içeren satır
    if (/^Y[ıi]l$/i.test(line) || line === 'Yıl' || line === 'YIL') {
      // Sonraki 5 satırda 4 haneli yıl ara
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const nextLine = lines[j];
        const yilMatch = nextLine.match(/\b(202[4-9])\b/);
        if (yilMatch) {
          yil = yilMatch[1];
          break;
        }
      }
    }
    
    // "Ay" kelimesini içeren satır
    if (/^Ay$/i.test(line) || line === 'Ay' || line === 'AY') {
      // Sonraki 5 satırda ay adı ara
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const nextLine = lines[j].toLowerCase().trim();
        if (ayMap[nextLine]) {
          ay = ayMap[nextLine];
          break;
        }
      }
    }
  }
  
  // Yöntem 2: Aynı satırda "Yıl 2025" veya "Yıl: 2025" formatı
  if (!yil) {
    const yilPatterns = [
      /Y[ıi]l\s*[:\s]\s*(\d{4})/i,
      /Y[ıi]l\s+(\d{4})/i
    ];
    
    for (const pattern of yilPatterns) {
      const match = rawText.match(pattern);
      if (match) {
        yil = match[1];
        break;
      }
    }
  }
  
  // Yöntem 3: Aynı satırda "Ay Kasım" veya "Ay: Kasım" formatı
  if (!ay) {
    for (const [ayAdi, ayNo] of Object.entries(ayMap)) {
      const pattern = new RegExp(`\\bAy\\s*[:\\s]\\s*${ayAdi}`, 'i');
      if (pattern.test(rawText)) {
        ay = ayNo;
        break;
      }
    }
  }
  
  // Yöntem 4: Sadece ay adını text içinde ara (son çare)
  if (!ay) {
    const textLower = rawText.toLowerCase();
    for (const [ayAdi, ayNo] of Object.entries(ayMap)) {
      // "Kasım" kelimesini bul ama "Kasım 2024" gibi yıl ile beraber olmalı
      const regex = new RegExp(`\\b${ayAdi}\\b`, 'i');
      if (regex.test(textLower)) {
        ay = ayNo;
        break;
      }
    }
  }
  
  // Yöntem 5: Yılı başka yerden al (son çare)
  if (!yil) {
    // DÖNEM TİPİ bölümünden sonra ara
    const donemIdx = rawText.indexOf('DÖNEM TİPİ');
    if (donemIdx !== -1) {
      const afterDonem = rawText.substring(donemIdx, donemIdx + 200);
      const yilMatch = afterDonem.match(/\b(202[4-9])\b/);
      if (yilMatch) {
        yil = yilMatch[1];
      }
    }
  }
  
  // Son çare: İlk bulunan 202X yılını al
  if (!yil) {
    const yilMatch = rawText.match(/\b(202[4-9])\b/);
    if (yilMatch) {
      yil = yilMatch[1];
    }
  }
  
  console.log(`   📅 Dönem Parse: Yıl=${yil}, Ay=${ay}`);
  
  if (yil && ay) {
    return `${yil}-${ay}`;
  }
  
  return null;
}

/**
 * Ciro Çıkarma
 * Ciro = Matrah Toplamı + Özel Matrah Dahil Olmayan Bedel
 * 
 * Örnekler:
 * - Normal mükellef: 213.894,65 + 0 = 213.894,65
 * - Yem satıcısı: 213.894,65 + 165.279,00 = 379.173,65
 * - Kuyumcu: 27.744,82 + 15.727.732,74 = 15.755.477,56
 */
function extractCiro(rawText, cleanText) {
  let matrahToplami = 0;
  let ozelMatrahBedeli = 0;
  
  // ═══════════════════════════════════════════════════════════════
  // 1. MATRAH TOPLAMI
  // ═══════════════════════════════════════════════════════════════
  const matrahPatterns = [
    /Matrah Toplam[ıi]\s*([\d.,]+)/i,
    /Matrah Toplami\s*([\d.,]+)/i
  ];
  
  for (const pattern of matrahPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      matrahToplami = parseDecimal(match[1]);
      break;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 2. ÖZEL MATRAH DAHİL OLMAYAN BEDEL
  // Bu alan kuyumcularda, yem satıcılarında vs. çok yüksek olabilir
  // ═══════════════════════════════════════════════════════════════
  
  // Yöntem A: cleanText'te ara
  const ozelMatrahPatterns = [
    /[ÖO]zel Maht?rah [SŞ]ekline\s*Tabi [İI][şs]lemlerde Matraha\s*Dahil Olmayan Bedel\s*([\d.,]+)/i,
    /Matraha\s*Dahil Olmayan Bedel\s*([\d.,]+)/i,
    /Dahil Olmayan Bedel\s*([\d.,]+)/i,
    /Tabi İşlemlerde Matraha Dahil Olmayan Bedel\s*([\d.,]+)/i
  ];
  
  for (const pattern of ozelMatrahPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const bedel = parseDecimal(match[1]);
      if (bedel > 0) {
        ozelMatrahBedeli = bedel;
        break;
      }
    }
  }
  
  // Yöntem B: rawText'te satır satır ara
  if (ozelMatrahBedeli === 0) {
    const lines = rawText.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // "Dahil Olmayan Bedel" içeren satırı bul
      if (line.includes('Dahil Olmayan Bedel') || 
          line.includes('Matraha Dahil Olmayan') ||
          line.includes('Tabi İşlemlerde Matraha')) {
        
        // Bu satırda sayı var mı?
        let numMatch = line.match(/([\d]{1,3}(?:\.[\d]{3})*,\d{2})/);
        if (numMatch) {
          const bedel = parseDecimal(numMatch[1]);
          if (bedel > 0) {
            ozelMatrahBedeli = bedel;
            break;
          }
        }
        
        // Sonraki 3 satırda sayı ara
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const nextLine = lines[j].trim();
          numMatch = nextLine.match(/([\d]{1,3}(?:\.[\d]{3})*,\d{2})/);
          if (numMatch) {
            const bedel = parseDecimal(numMatch[1]);
            // Matrah toplamından farklı olmalı
            if (bedel > 0 && bedel !== matrahToplami) {
              ozelMatrahBedeli = bedel;
              break;
            }
          }
        }
        
        if (ozelMatrahBedeli > 0) break;
      }
    }
  }
  
  // Yöntem C: ÖZEL MATRAH ŞEKLİ TESPİT EDİLEN İŞLEMLER tablosundan
  if (ozelMatrahBedeli === 0) {
    const ozelMatrahIdx = rawText.indexOf('ÖZEL MATRAH');
    if (ozelMatrahIdx !== -1) {
      const section = rawText.substring(ozelMatrahIdx, ozelMatrahIdx + 1000);
      // En büyük sayıyı bul (Matrah Toplamı hariç)
      const allNumbers = section.match(/([\d]{1,3}(?:\.[\d]{3})*,\d{2})/g);
      if (allNumbers) {
        for (const numStr of allNumbers) {
          const num = parseDecimal(numStr);
          if (num > ozelMatrahBedeli && num !== matrahToplami) {
            ozelMatrahBedeli = num;
          }
        }
      }
    }
  }
  
  const toplam = matrahToplami + ozelMatrahBedeli;
  
  console.log(`   📊 Ciro Detay: Matrah=${matrahToplami.toLocaleString('tr-TR')} + ÖzelMatrah=${ozelMatrahBedeli.toLocaleString('tr-TR')} = ${toplam.toLocaleString('tr-TR')}`);
  
  return toplam;
}

/**
 * Gider Çıkarma
 * Gider = Alınan Mal ve Hizmete Ait Bedel (tüm KDV oranları) + KDV Ödenmeksizin Temin Edilen Mal Bedeli
 * 
 * PDF yapısı:
 * BU DÖNEME AİT İNDİRİLECEK KDV TUTARININ ORANLARA GÖRE DAĞILIMI
 * Alınan Mal ve Hizmete Ait Bedel
 * 10    26.572,80    2.657,28
 * 20    233.220,55   46.644,11
 */
function extractGider(rawText, cleanText) {
  let alisGider = 0;
  let istisnaBedeli = 0;
  
  // ═══════════════════════════════════════════════════════════════
  // 1. ALINAN MAL VE HİZMETE AİT BEDEL
  // ═══════════════════════════════════════════════════════════════
  
  const alisIdx = rawText.indexOf('Alınan Mal ve Hizmete Ait Bedel');
  
  if (alisIdx !== -1) {
    // Bu bölümden sonraki alanı al
    const alisSection = rawText.substring(alisIdx, alisIdx + 2000);
    const lines = alisSection.split('\n');
    
    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;
      
      // "Tecil" veya "İhracat" görünce dur
      if (cleanLine.includes('Tecil') || cleanLine.includes('İhracat')) {
        break;
      }
      
      // KDV oranı ile başlayan satırları bul
      // Format: ORAN BEDEL KDV_TUTARI
      // Örnek: "10 26.572,80 2.657,28"
      
      // Boşlukları temizle ve parse et
      const noSpace = cleanLine.replace(/\s+/g, '');
      
      // Pattern: başında 1,8,10,18,20 ve ardından Türk formatında sayılar
      const patterns = [
        /^(1)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/,   // %1
        /^(8)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/,   // %8
        /^(10)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/,  // %10
        /^(18)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/,  // %18
        /^(20)([\d]{1,3}(?:\.[\d]{3})*,\d{2})([\d]{1,3}(?:\.[\d]{3})*,\d{2})/   // %20
      ];
      
      for (const pattern of patterns) {
        const match = noSpace.match(pattern);
        if (match) {
          const bedel = parseDecimal(match[2]);
          if (bedel > 0) {
            alisGider += bedel;
            console.log(`   📦 Alış KDV%${match[1]}: ${bedel.toLocaleString('tr-TR')}`);
          }
          break;
        }
      }
    }
  }
  
  // Alternatif yöntem: cleanText'te ara
  if (alisGider === 0) {
    // Tüm "Alınan Mal" bölümünü bul
    const alisMatch = cleanText.match(/Al[ıi]nan Mal ve Hizmete Ait Bedel([\s\S]{0,1500}?)(?:Tecil|İhracat|Yurtiçi ve Yurtdışı KDV)/i);
    if (alisMatch) {
      const section = alisMatch[1];
      // Türk formatındaki tüm sayıları bul
      const numbers = section.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g);
      if (numbers) {
        // Her 2 sayıdan ilki bedel, ikincisi KDV
        for (let i = 0; i < numbers.length - 1; i += 2) {
          const bedel = parseDecimal(numbers[i]);
          if (bedel > 0) {
            alisGider += bedel;
          }
        }
      }
    }
  }
  
  // ═══════════════════════════════════════════════════════════════
  // 2. KDV ÖDENMEKSİZİN TEMİN EDİLEN MAL BEDELİ (İstisna alışları)
  // ═══════════════════════════════════════════════════════════════
  
  const istisnaPatterns = [
    /KDV [ÖO]denmeksizin Temin Edilen Mal\s*Bedeli\s*([\d.,]+)/i,
    /[ÖO]denmeksizin Temin Edilen Mal Bedeli\s*([\d.,]+)/i,
    /KDV Ödenmeksizin Temin Edilen\s*Mal Bedeli\s*([\d.,]+)/i
  ];
  
  for (const pattern of istisnaPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const bedel = parseDecimal(match[1]);
      if (bedel > 0) {
        istisnaBedeli = bedel;
        console.log(`   🏷️ İstisna Alış: ${bedel.toLocaleString('tr-TR')}`);
        break;
      }
    }
  }
  
  // rawText'te de ara
  if (istisnaBedeli === 0) {
    const istisnaIdx = rawText.indexOf('KDV Ödenmeksizin Temin Edilen');
    if (istisnaIdx !== -1) {
      const section = rawText.substring(istisnaIdx, istisnaIdx + 200);
      const numMatch = section.match(/([\d]{1,3}(?:\.[\d]{3})*,\d{2})/);
      if (numMatch) {
        istisnaBedeli = parseDecimal(numMatch[1]);
        if (istisnaBedeli > 0) {
          console.log(`   🏷️ İstisna Alış (alt): ${istisnaBedeli.toLocaleString('tr-TR')}`);
        }
      }
    }
  }
  
  const toplam = alisGider + istisnaBedeli;
  
  console.log(`   📊 Gider Detay: Alış=${alisGider.toLocaleString('tr-TR')} + İstisna=${istisnaBedeli.toLocaleString('tr-TR')} = ${toplam.toLocaleString('tr-TR')}`);
  
  return toplam;
}

/**
 * Devreden KDV Çıkarma
 * "Sonraki Döneme Devreden Katma Değer Vergisi" alanı
 */
function extractDevredenKDV(rawText, cleanText) {
  const patterns = [
    /Sonraki D[öo]neme Devreden Katma De[ğg]er Vergisi\s*([\d.,]+)/i,
    /Sonraki Döneme Devreden\s*[\n\r]?\s*([\d.,]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      return parseDecimal(match[1]);
    }
  }
  
  // rawText'te satır satır ara
  const lines = rawText.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Sonraki Döneme Devreden')) {
      // Bu satırda veya sonraki satırlarda sayı ara
      for (let j = i; j < Math.min(i + 3, lines.length); j++) {
        const numMatch = lines[j].match(/([\d]{1,3}(?:\.[\d]{3})*,\d{2})/);
        if (numMatch) {
          return parseDecimal(numMatch[1]);
        }
      }
    }
  }
  
  return 0;
}

/**
 * POS Tahsilat Çıkarma
 * "Kredi Kartı İle Tahsil Edilen..." alanı
 */
function extractPOS(cleanText) {
  const patterns = [
    /Kredi Kart[ıi] [İI]le Tahsil Edilen[^\d]*([\d.,]+)/i,
    /Kredi Kart[ıi] [İI]le Tahsil[^\d]*([\d.,]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = cleanText.match(pattern);
    if (match) {
      return parseDecimal(match[1]);
    }
  }
  
  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// ANA PARSE FONKSİYONU
// ═══════════════════════════════════════════════════════════════════════════

/**
 * KDV-1 Beyannamesini Parse Et
 * Tüm mükellef tipleri için çalışır
 */
function parseKDVBeyanname(rawText) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('🔍 PDF PARSE BAŞLADI');
  console.log('═══════════════════════════════════════════════════════════');
  
  // Temizlenmiş text
  const cleanText = rawText.replace(/\s+/g, ' ');
  
  // TC Kimlik No / VKN
  const tc = extractTC(rawText);
  console.log(`👤 TC/VKN: ${tc || 'BULUNAMADI'}`);
  
  // Dönem
  const period = extractPeriod(rawText);
  const periodName = period ? formatPeriodName(period) : null;
  console.log(`📅 Dönem: ${periodName || 'BULUNAMADI'}`);
  
  // Ciro
  const ciro = extractCiro(rawText, cleanText);
  console.log(`💰 Ciro: ${ciro.toLocaleString('tr-TR')} ₺`);
  
  // Gider
  const gider = extractGider(rawText, cleanText);
  console.log(`📉 Gider: ${gider.toLocaleString('tr-TR')} ₺`);
  
  // Net Kalan
  const netKalan = ciro - gider;
  console.log(`📊 Net Kalan: ${netKalan.toLocaleString('tr-TR')} ₺`);
  
  // Devreden KDV
  const devredenKDV = extractDevredenKDV(rawText, cleanText);
  console.log(`🔄 Devreden KDV: ${devredenKDV.toLocaleString('tr-TR')} ₺`);
  
  // POS
  const pos = extractPOS(cleanText);
  console.log(`💳 POS Tahsilat: ${pos.toLocaleString('tr-TR')} ₺`);
  
  console.log('═══════════════════════════════════════════════════════════\n');
  
  return {
    tc,
    period,
    periodName,
    ciro,
    gider,
    netKalan,
    devredenKDV,
    pos
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINT'LERİ - VERİ ÇEKME
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /financial-periods
 * Mükellefin kayıtlı dönemlerini listele
 */
router.get('/financial-periods', async (req, res) => {
  try {
    const { userId, tc } = req.query;
    
    let tcHash = null;
    if (userId) {
      tcHash = await getTcHashFromUserId(userId);
    } else if (tc) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    }
    
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
    
    const periods = data.map(d => d.period);
    const yearsSet = new Set(periods.map(p => parseInt(p.split('-')[0])));
    const years = Array.from(yearsSet).sort((a, b) => b - a);
    
    const periodDetails = periods.map(p => ({
      value: p,
      label: formatPeriodName(p)
    }));
    
    console.log(`✅ Dönemler: ${periods.length} adet`);
    
    res.json({ success: true, periods: periodDetails, years });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /financial-data/:period
 * Belirli dönem verisini getir
 */
router.get('/financial-data/:period', async (req, res) => {
  try {
    const { period } = req.params;
    const { userId, tc } = req.query;
    
    if (!period || !/^\d{4}-\d{2}$/.test(period)) {
      return res.status(400).json({ success: false, error: 'Geçersiz dönem formatı' });
    }
    
    let tcHash = null;
    if (userId) {
      tcHash = await getTcHashFromUserId(userId);
    } else if (tc) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    }
    
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .eq('period', period)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ success: false, error: 'DB hatası' });
    }
    
    if (!data) {
      return res.json({ success: false, message: 'Bu dönem için veri yok' });
    }
    
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
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /financial-yearly/:year
 * Yıllık özet ve aylık detaylar
 */
router.get('/financial-yearly/:year', async (req, res) => {
  try {
    const { year } = req.params;
    const { userId, tc } = req.query;
    
    if (!year || !/^\d{4}$/.test(year)) {
      return res.status(400).json({ success: false, error: 'Geçersiz yıl formatı' });
    }
    
    let tcHash = null;
    if (userId) {
      tcHash = await getTcHashFromUserId(userId);
    } else if (tc) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    }
    
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .gte('period', `${year}-01`)
      .lte('period', `${year}-12`)
      .order('period', { ascending: true });
    
    if (error) {
      return res.status(500).json({ success: false, error: 'DB hatası' });
    }
    
    if (!data || data.length === 0) {
      return res.json({ success: false, message: `${year} yılı için veri yok` });
    }
    
    let toplamCiro = 0;
    let toplamGider = 0;
    let toplamPOS = 0;
    
    const monthly = data.map((record, idx) => {
      toplamCiro += record.ciro || 0;
      toplamGider += record.gider || 0;
      toplamPOS += record.pos_tahsilat || 0;
      
      const result = {
        period: record.period,
        periodName: formatPeriodName(record.period),
        ay: parseInt(record.period.split('-')[1]),
        ciro: record.ciro,
        gider: record.gider,
        netKalan: record.ciro - record.gider,
        devredenKDV: record.devreden_kdv,
        pos: record.pos_tahsilat
      };
      
      // Değişim yüzdeleri
      if (idx > 0) {
        const prev = data[idx - 1];
        if (prev.ciro > 0) {
          result.ciroChange = parseFloat(((record.ciro - prev.ciro) / prev.ciro * 100).toFixed(1));
        }
        if (prev.gider > 0) {
          result.giderChange = parseFloat(((record.gider - prev.gider) / prev.gider * 100).toFixed(1));
        }
      }
      
      return result;
    });
    
    const netKalan = toplamCiro - toplamGider;
    const karMarji = toplamCiro > 0 ? parseFloat(((netKalan / toplamCiro) * 100).toFixed(1)) : 0;
    
    res.json({
      success: true,
      year: parseInt(year),
      summary: {
        toplamCiro,
        toplamGider,
        netKalan,
        toplamPOS,
        karMarji,
        aylikOrtalamaCiro: Math.round(toplamCiro / data.length),
        aylikOrtalamaGider: Math.round(toplamGider / data.length),
        kayitliAySayisi: data.length
      },
      monthly
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /financial-data
 * En son dönem verisini getir
 */
router.get('/financial-data', async (req, res) => {
  try {
    const { userId, tc } = req.query;
    
    let tcHash = null;
    if (userId) {
      tcHash = await getTcHashFromUserId(userId);
    } else if (tc) {
      tcHash = hashTC(tc);
    }
    
    if (!tcHash) {
      return res.status(400).json({ success: false, error: 'userId veya tc gerekli' });
    }
    
    const { data, error } = await supabase
      .from('financial_statements')
      .select('*')
      .eq('tc_kimlik_no_hash', tcHash)
      .order('period', { ascending: false })
      .limit(1);
    
    if (error) {
      return res.status(500).json({ success: false, error: 'DB hatası' });
    }
    
    if (!data || data.length === 0) {
      return res.json({ success: false, message: 'Veri yok' });
    }
    
    const record = data[0];
    
    // Önceki dönem karşılaştırması
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
      if (prevData.ciro > 0) {
        ciroChange = parseFloat(((record.ciro - prevData.ciro) / prevData.ciro * 100).toFixed(1));
      }
      if (prevData.gider > 0) {
        giderChange = parseFloat(((record.gider - prevData.gider) / prevData.gider * 100).toFixed(1));
      }
    }
    
    res.json({
      success: true,
      data: {
        period: record.period,
        periodName: formatPeriodName(record.period),
        ciro: record.ciro,
        gider: record.gider,
        netKalan: record.ciro - record.gider,
        devredenKDV: record.devreden_kdv,
        pos: record.pos_tahsilat,
        ciroChange,
        giderChange
      }
    });
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// API ENDPOINT'LERİ - PDF UPLOAD
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /admin/test-parse
 * PDF'i parse et, sonucu göster (DB'ye kaydetme)
 */
router.post('/admin/test-parse', upload.single('pdf'), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Yetkisiz!' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'PDF dosyası yok!' });
    }
    
    const pdfData = await pdfParse(req.file.buffer);
    const parsed = parseKDVBeyanname(pdfData.text);
    
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
      rawText: pdfData.text.substring(0, 15000)
    });
    
  } catch (err) {
    console.error('❌ Test Parse Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/upload-pdfs
 * Toplu PDF yükle (200 adet'e kadar)
 */
router.post('/admin/upload-pdfs', upload.array('pdfs', 200), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Yetkisiz!' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'PDF yok!' });
    }
    
    console.log(`\n📥 ${req.files.length} PDF yükleniyor...\n`);
    
    const results = { success: [], errors: [] };
    
    for (const file of req.files) {
      try {
        const pdfData = await pdfParse(file.buffer);
        const parsed = parseKDVBeyanname(pdfData.text);
        
        if (!parsed.tc) {
          results.errors.push({ file: file.originalname, error: 'TC/VKN bulunamadı' });
          continue;
        }
        
        if (!parsed.period) {
          results.errors.push({ file: file.originalname, error: 'Dönem bulunamadı' });
          continue;
        }
        
        const tcHash = hashTC(parsed.tc);
        
        const { error } = await supabase.from('financial_statements').upsert({
          tc_kimlik_no_hash: tcHash,
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
            period: parsed.periodName,
            tc: parsed.tc,
            ciro: parsed.ciro,
            gider: parsed.gider
          });
        }
        
      } catch (err) {
        results.errors.push({ file: file.originalname, error: err.message });
      }
    }
    
    console.log(`\n📊 Sonuç: ${results.success.length} başarılı, ${results.errors.length} hatalı\n`);
    
    res.json({ success: true, results });
    
  } catch (error) {
    console.error('❌ Upload Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /admin/upload-pdf
 * Tek PDF yükle
 */
router.post('/admin/upload-pdf', upload.single('pdf'), async (req, res) => {
  try {
    const { password } = req.body;
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Yetkisiz' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Dosya yok' });
    }
    
    const pdfData = await pdfParse(req.file.buffer);
    const parsed = parseKDVBeyanname(pdfData.text);
    
    if (!parsed.tc) {
      return res.status(400).json({ error: 'TC/VKN bulunamadı' });
    }
    
    if (!parsed.period) {
      return res.status(400).json({ error: 'Dönem bulunamadı' });
    }
    
    const tcHash = hashTC(parsed.tc);
    
    const { error } = await supabase.from('financial_statements').upsert({
      tc_kimlik_no_hash: tcHash,
      period: parsed.period,
      ciro: parsed.ciro,
      gider: parsed.gider,
      devreden_kdv: parsed.devredenKDV,
      pos_tahsilat: parsed.pos,
      pdf_filename: req.file.originalname,
      processed_at: new Date().toISOString()
    }, { onConflict: 'tc_kimlik_no_hash,period' });
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.json({
      success: true,
      data: {
        tc: parsed.tc,
        period: parsed.period,
        periodName: parsed.periodName,
        ciro: parsed.ciro,
        gider: parsed.gider,
        netKalan: parsed.netKalan,
        devredenKDV: parsed.devredenKDV,
        pos: parsed.pos
      }
    });
    
  } catch (err) {
    console.error('❌ Tek PDF Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
