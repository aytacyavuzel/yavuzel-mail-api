const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");
const XLSX = require("xlsx");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({ storage: multer.memoryStorage() });

// ============================================
// YARDIMCI FONKSİYONLAR
// ============================================

// TC'yi SHA-256 ile hashle
function hashTC(tc) {
  return crypto.createHash("sha256").update(tc.toString()).digest("hex");
}

// userId'den tcHash al (mali.js ile aynı)
async function getTcHashFromUserId(userId) {
  if (!userId) return null;
  
  const { data } = await supabase
    .from('users')
    .select('tc_vkn_hash')
    .eq('id', userId)
    .single();
  
  return data?.tc_vkn_hash || null;
}

// Türkçe ay isimlerini İngilizce sütun adlarına çevir
const AY_MAP = {
  "OCAK": "jan_paid",
  "ŞUBAT": "feb_paid",
  "MART": "mar_paid",
  "NİSAN": "apr_paid",
  "MAYIS": "may_paid",
  "HAZİRAN": "jun_paid",
  "TEMMUZ": "jul_paid",
  "AĞUSTOS": "aug_paid",
  "EYLÜL": "sep_paid",
  "EKİM": "oct_paid",
  "KASIM": "nov_paid",
  "ARALIK": "dec_paid"
};

// ============================================
// EXCEL UPLOAD - Admin için
// ============================================
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    // Şifre kontrolü
    if (req.body.password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: "Yanlış şifre" });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Dosya yok" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      return res.status(400).json({ success: false, message: "Excel boş" });
    }

    // Başlık satırını al
    const headers = rows[0];
    
    // Sütun indexlerini bul
    let tcVknIndex = -1;
    let monthlyFeeIndex = -1;
    let year = new Date().getFullYear();
    const ayIndexMap = {};

    headers.forEach((header, index) => {
      if (!header) return;
      const h = header.toString().toUpperCase().trim();
      
      if (h.includes("TC") || h.includes("VKN")) {
        tcVknIndex = index;
      }
      
      // "2026 (AYLIK)" veya "2025 (AYLIK)" formatı
      if (h.includes("AYLIK")) {
        monthlyFeeIndex = index;
        const yearMatch = h.match(/(\d{4})/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
        }
      }
      
      // Ay sütunlarını bul
      Object.keys(AY_MAP).forEach(ayAdi => {
        if (h === ayAdi) {
          ayIndexMap[AY_MAP[ayAdi]] = index;
        }
      });
    });

    if (tcVknIndex === -1) {
      return res.status(400).json({ success: false, message: "TC/VKN sütunu bulunamadı" });
    }

    if (monthlyFeeIndex === -1) {
      return res.status(400).json({ success: false, message: "Aylık ücret sütunu bulunamadı" });
    }

    let inserted = 0;
    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Veri satırlarını işle (ilk satır başlık)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      const tcVkn = row[tcVknIndex]?.toString().trim();
      if (!tcVkn) continue;

      // TC'yi hashle
      const tcHash = hashTC(tcVkn);

      // Hash'ten user_id bul (opsiyonel - geriye uyumluluk için)
      const { data: userData } = await supabase
        .from("users")
        .select("id")
        .eq("tc_vkn_hash", tcHash)
        .single();

      const userId = userData?.id || null;
      const monthlyFee = parseFloat(row[monthlyFeeIndex]) || 0;

      // Ödeme verilerini hazırla
      const feeData = {
        user_id: userId,
        tc_vkn_hash: tcHash, // YENİ: tc_vkn_hash eklendi
        year: year,
        monthly_fee: monthlyFee,
        jan_paid: null,
        feb_paid: null,
        mar_paid: null,
        apr_paid: null,
        may_paid: null,
        jun_paid: null,
        jul_paid: null,
        aug_paid: null,
        sep_paid: null,
        oct_paid: null,
        nov_paid: null,
        dec_paid: null
      };

      // Ay ödemelerini ekle
      Object.keys(ayIndexMap).forEach(ayKey => {
        const idx = ayIndexMap[ayKey];
        const val = row[idx];
        if (val !== null && val !== undefined && val !== "") {
          feeData[ayKey] = parseFloat(val) || null;
        }
      });

      // Mevcut kayıt var mı kontrol et (tc_vkn_hash + year ile)
      const { data: existing } = await supabase
        .from("accounting_fees")
        .select("id")
        .eq("tc_vkn_hash", tcHash)
        .eq("year", year)
        .single();

      if (existing) {
        await supabase
          .from("accounting_fees")
          .update(feeData)
          .eq("id", existing.id);
        updated++;
      } else {
        await supabase.from("accounting_fees").insert(feeData);
        inserted++;
      }

      // Kullanıcı bulunamadıysa log (ama kayıt yine de eklenir)
      if (!userId) {
        console.log(`⚠️ Kullanıcı bulunamadı ama kayıt eklendi: TC ${tcVkn.substring(0, 3)}***`);
      }
    }

    console.log(`✅ Excel yüklendi: ${inserted} eklendi, ${updated} güncellendi, ${skipped} atlandı`);

    res.json({
      success: true,
      message: `${inserted} eklendi, ${updated} güncellendi, ${skipped} atlandı`,
      inserted,
      updated,
      skipped,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// Kullanıcının TÜM yıllardaki ücret verisini getir
// ═══════════════════════════════════════════════════════════════
router.get("/user/:userId/all", async (req, res) => {
  try {
    const { userId } = req.params;

    // userId'den tc_vkn_hash al
    const tcHash = await getTcHashFromUserId(userId);
    
    if (!tcHash) {
      return res.json({ success: true, data: [], years: [] });
    }

    // tc_vkn_hash ile sorgula
    const { data, error } = await supabase
      .from("accounting_fees")
      .select("*")
      .eq("tc_vkn_hash", tcHash)
      .order("year", { ascending: false });

    if (error) {
      throw error;
    }

    res.json({ 
      success: true, 
      data: data || [],
      years: data ? data.map(d => d.year) : []
    });
  } catch (error) {
    console.error("Get all fees error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// Kullanıcının ücret verisini getir (tek yıl)
// ═══════════════════════════════════════════════════════════════
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const year = req.query.year;

    // userId'den tc_vkn_hash al
    const tcHash = await getTcHashFromUserId(userId);
    
    if (!tcHash) {
      return res.json({ success: true, data: null });
    }

    // tc_vkn_hash ile sorgula
    let query = supabase
      .from("accounting_fees")
      .select("*")
      .eq("tc_vkn_hash", tcHash);

    if (year) {
      // Yıl belirtilmişse o yılı getir
      query = query.eq("year", parseInt(year));
    } else {
      // Yıl belirtilmemişse en güncel yılı getir
      query = query.order("year", { ascending: false }).limit(1);
    }

    const { data, error } = await query.single();

    if (error && error.code !== "PGRST116") {
      throw error;
    }

    res.json({ success: true, data: data || null });
  } catch (error) {
    console.error("Get fee error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
