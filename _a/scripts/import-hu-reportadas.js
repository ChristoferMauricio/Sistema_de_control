/**
 * Script: import-hu-reportadas.js
 * Description: Reads the "Historias reportadas.xlsx" Excel file and imports the rows
 *              into the "hu_reportadas" table in Supabase using the service role client.
 */

const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

// Load .env.local
const envPath = path.resolve(__dirname, "../.env.local");
let SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
let SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const parts = trimmed.split("=");
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join("=").trim().replace(/^['"]|['"]$/g, "");
        if (key === "NEXT_PUBLIC_SUPABASE_URL") SUPABASE_URL = value;
        if (key === "SUPABASE_SERVICE_ROLE_KEY") SUPABASE_SERVICE_KEY = value;
      }
    }
  });
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Error: Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const excelPath = path.resolve("d:/OneDrive_UNI/OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA/Desktop/PGIM/_SISTEMA/Sistema_de_control/Historias reportadas.xlsx");

async function importExcel() {
  console.log("=== STARTING EXCEL IMPORT ===");
  if (!fs.existsSync(excelPath)) {
    console.error(`❌ Error: Excel file not found at: ${excelPath}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(excelPath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  // Parse without headers to process manually
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rawData.length <= 1) {
    console.log("⚠️ No data to import.");
    return;
  }

  // First row is headers: ["Código épica","Resumen épica","Código historia","Resumen épica","Puntos","ITERACION","NOTA"]
  const headers = rawData[0];
  console.log(`Headers: ${JSON.stringify(headers)}`);

  const rows = [];
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || row.length === 0) continue;

    // Map columns
    const epic_key = row[0] ? String(row[0]).trim() : null;
    const epic_summary = row[1] ? String(row[1]).trim() : null;
    const story_key = row[2] ? String(row[2]).trim() : null;
    const story_summary = row[3] ? String(row[3]).trim() : null;
    const story_points = row[4] != null && row[4] !== "" ? Number(row[4]) : null;
    const sprint = row[5] ? String(row[5]).trim() : null;
    const nota = row[6] ? String(row[6]).trim() : null;

    if (!story_key) {
      console.warn(`⚠️ Warning: Row ${i} has no story key. Skipping.`);
      continue;
    }

    rows.push({
      epic_key,
      epic_summary,
      story_key,
      story_summary,
      story_points,
      sprint,
      nota
    });
  }

  console.log(`Parsed ${rows.length} rows from Excel.`);

  // Insert in batches of 100 to avoid request size limits
  const batchSize = 100;
  let successCount = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Uploading batch ${i / batchSize + 1} (${batch.length} rows)...`);

    const { error } = await supabaseAdmin
      .from("hu_reportadas")
      .upsert(batch, { onConflict: "story_key" });

    if (error) {
      console.error(`❌ Error uploading batch:`, error.message);
      console.error(`Please verify that you ran the SQL migration to create the public.hu_reportadas table first!`);
      process.exit(1);
    }

    successCount += batch.length;
  }

  console.log(`\n🎉 SUCCESS: Imported ${successCount} stories into Supabase!`);
}

importExcel().catch((err) => {
  console.error("❌ Unexpected Error:", err);
});
