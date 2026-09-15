/**
 * Script: upsert-sprint17-reportadas.js
 * Description: Inserta/actualiza las historias del Sprint 17 como "Reportadas"
 *              en la tabla hu_reportadas de Supabase.
 *
 * Uso: node scripts/upsert-sprint17-reportadas.js
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

// ── Historias a marcar como reportadas en Sprint 17 ──────────────────────────
const SPRINT = "Iteración 17";

const storyKeys = [
  "PF3-5862",
  "PF3-5855",
  "PF3-5824",
  "PF3-5799",
  "PF3-5733",
  "PF3-5599",
  "PF3-5594",
  "PF3-5549",
  "PF3-5539",
  "PF3-5534",
  "PF3-5496",
  "PF3-5486",
  "PF3-5406",
  "PF3-5400",
  "PF3-5395",
  "PF3-5361",
  "PF3-5337",
  "PF3-5327",
  "PF3-5317",
  "PF3-5306",
  "PF3-5286",
  "PF3-5265",
  "PF3-5239",
  "PF3-5215",
  "PF3-5201",
  "PF3-5187",
  "PF3-5178",
  "PF3-5156",
  "PF3-5142",
  "PF3-5128",
  "PF3-5114",
  "PF3-4994",
  "PF3-4929",
  "PF3-4911",
  "PF3-4821",
  "PF3-4816",
  "PF3-4811",
  "PF3-4806",
  "PF3-4801",
  "PF3-4795",
  "PF3-4790",
  "PF3-4732",
  "PF3-4647",
  "PF3-4575",
  "PF3-4523",
  "PF3-4518",
  "PF3-4513",
  "PF3-4200",
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
