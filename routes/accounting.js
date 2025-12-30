const express = require("express");
const router = express.Router();
const { createClient } = require("@supabase/supabase-js");
const multer = require("multer");
const XLSX = require("xlsx");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({ storage: multer.memoryStorage() });

// Excel yükleme - Admin için
router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Dosya yok" });
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let inserted = 0;
    let updated = 0;

    for (const row of rows) {
      const userId = row.user_id;
      const year = row.year || 2025;

      if (!userId) continue;

      const feeData = {
        user_id: userId,
        year: year,
        monthly_fee: row.monthly_fee || 0,
        jan_paid: row.jan_paid ?? null,
        feb_paid: row.feb_paid ?? null,
        mar_paid: row.mar_paid ?? null,
        apr_paid: row.apr_paid ?? null,
        may_paid: row.may_paid ?? null,
        jun_paid: row.jun_paid ?? null,
        jul_paid: row.jul_paid ?? null,
        aug_paid: row.aug_paid ?? null,
        sep_paid: row.sep_paid ?? null,
        oct_paid: row.oct_paid ?? null,
        nov_paid: row.nov_paid ?? null,
        dec_paid: row.dec_paid ?? null,
      };

      const { data: existing } = await supabase
        .from("accounting_fees")
        .select("id")
        .eq("user_id", userId)
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
    }

    res.json({
      success: true,
      message: `${inserted} eklendi, ${updated} güncellendi`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Kullanıcının ücret verisini getir
router.get("/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const year = req.query.year || new Date().getFullYear();

    const { data, error } = await supabase
      .from("accounting_fees")
      .select("*")
      .eq("user_id", userId)
      .eq("year", year)
      .single();

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
