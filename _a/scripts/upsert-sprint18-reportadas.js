/**
 * Script: upsert-sprint18-reportadas.js
 * Description: Inserta/actualiza las historias del Sprint 18 como "Reportadas"
 *              en la tabla hu_reportadas de Supabase.
 *
 * Uso: node scripts/upsert-sprint18-reportadas.js
 */

const { createClient } = require("@supabase/supabase-js");
const path = require("path");
const fs = require("fs");

// ── Cargar .env.local ────────────────────────────────────────────────────────
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
  console.error("❌ Error: Faltan credenciales de Supabase en .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Historias a marcar como reportadas en Sprint 18 ──────────────────────────
const SPRINT = "Iteración 18";

const storyKeys = [
  "PF3-4410",
  "PF3-5670",
  "PF3-5665",
  "PF3-5655",
  "PF3-5559",
  "PF3-5270",
  "PF3-5738",
  "PF3-5624",
  "PF3-5554",
  "PF3-5491",
  "PF3-4876",
  "PF3-5225",
  "PF3-5690",
  "PF3-5685",
  "PF3-5680",
  "PF3-5675",
  "PF3-5660",
  "PF3-6326",
  "PF3-4836",
  "PF3-5952",
  "PF3-6518",
  "PF3-6321",
  "PF3-6018",
  "PF3-6371",
  "PF3-6286",
  "PF3-6296",
  "PF3-6291",
  "PF3-6281",
  "PF3-5895",
  "PF3-6432",
  "PF3-5993",
  "PF3-6539",
  "PF3-6534",
  "PF3-6392",
  "PF3-6331",
  "PF3-6529",
  "PF3-6457",
  "PF3-6462",
  "PF3-6407",
  "PF3-6275",
  "PF3-6442",
  "PF3-6386",
  "PF3-5860",
];

async function upsertReportadas() {
  console.log(`\n=== UPSERT HU REPORTADAS - ${SPRINT} ===`);
  console.log(`Total de historias a procesar: ${storyKeys.length}\n`);

  // Construir los registros para upsert
  const rows = storyKeys.map((key) => ({
    story_key: key,
    sprint: SPRINT,
  }));

  // Upsert en lotes de 50
  const batchSize = 50;
  let successCount = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Procesando lote ${Math.floor(i / batchSize) + 1} (${batch.length} historias)...`);

    const { data, error } = await supabaseAdmin
      .from("hu_reportadas")
      .upsert(batch, { onConflict: "story_key" })
      .select("story_key");

    if (error) {
      console.error(`❌ Error en upsert:`, error.message);
      process.exit(1);
    }

    successCount += batch.length;
    console.log(`   ✅ Lote procesado correctamente.`);
  }

  console.log(`\n🎉 ÉXITO: ${successCount} historias marcadas como reportadas en "${SPRINT}".`);

  // Verificar los registros insertados
  console.log(`\n── Verificación ──`);
  const { data: verification, error: verError } = await supabaseAdmin
    .from("hu_reportadas")
    .select("story_key, sprint")
    .in("story_key", storyKeys)
    .order("story_key", { ascending: true });

  if (verError) {
    console.error("❌ Error en verificación:", verError.message);
  } else {
    console.log(`Historias encontradas en BD: ${verification.length}/${storyKeys.length}`);
    const mismatched = verification.filter((r) => r.sprint !== SPRINT);
    if (mismatched.length > 0) {
      console.warn(`⚠️ ${mismatched.length} historias tienen un sprint diferente:`);
      mismatched.forEach((r) => console.warn(`   ${r.story_key}: "${r.sprint}"`));
    } else {
      console.log(`✅ Todas las historias tienen sprint = "${SPRINT}"`);
    }
  }
}

upsertReportadas().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
