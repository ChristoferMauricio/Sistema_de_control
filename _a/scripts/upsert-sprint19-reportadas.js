/**
 * Script: upsert-sprint19-reportadas.js
 * Description: Inserta/actualiza las 59 historias del Sprint 19 como "Reportadas"
 *              en la tabla hu_reportadas de Supabase y autocompleta sus campos
 *              (story_summary, story_points, epic_key, epic_summary) desde jira_tickets.
 *
 * Uso: node scripts/upsert-sprint19-reportadas.js
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

// ── Historias a marcar como reportadas en Sprint 19 ──────────────────────────
const SPRINT = "Iteración 19";

const storyKeys = [
  "PF3-6878",
  "PF3-6798",
  "PF3-6306",
  "PF3-6741",
  "PF3-6694",
  "PF3-6669",
  "PF3-6804",
  "PF3-6658",
  "PF3-6848",
  "PF3-6853",
  "PF3-6793",
  "PF3-6513",
  "PF3-6114",
  "PF3-6089",
  "PF3-6341",
  "PF3-6336",
  "PF3-6269",
  "PF3-6381",
  "PF3-6637",
  "PF3-6632",
  "PF3-6689",
  "PF3-6788",
  "PF3-4861",
  "PF3-4319",
  "PF3-6746",
  "PF3-5998",
  "PF3-5844",
  "PF3-6716",
  "PF3-6549",
  "PF3-6736",
  "PF3-6164",
  "PF3-6544",
  "PF3-5963",
  "PF3-6523",
  "PF3-6412",
  "PF3-5700",
  "PF3-6053",
  "PF3-6064",
  "PF3-6119",
  "PF3-6124",
  "PF3-6134",
  "PF3-6139",
  "PF3-6144",
  "PF3-6149",
  "PF3-6159",
  "PF3-4871",
  "PF3-6301",
  "PF3-6311",
  "PF3-5695",
  "PF3-6169",
  "PF3-6174",
  "PF3-6179",
  "PF3-6189",
  "PF3-6194",
  "PF3-6199",
  "PF3-6204",
  "PF3-6214",
  "PF3-5526",
  "PF3-6512",
];

function isEpicType(type) {
  const t = (type || "").toLowerCase();
  return t === "epic" || t.includes("epic") || t.includes("épica");
}

async function upsertAndCompleteReportadas() {
  console.log(`\n=== UPSERT & AUTOCOMPLETAR HU REPORTADAS - ${SPRINT} ===`);
  console.log(`Total de historias a procesar: ${storyKeys.length}\n`);

  // 1. Obtener datos de jira_tickets para esas claves
  const { data: tickets, error: ticketError } = await supabaseAdmin
    .from("jira_tickets")
    .select("jira_key, summary, story_points, parent_key, issue_type")
    .in("jira_key", storyKeys)
    .is("deleted_at", null);

  if (ticketError) {
    console.error("❌ Error al leer jira_tickets:", ticketError.message);
    process.exit(1);
  }

  console.log(`🎫 Tickets encontrados en jira_tickets: ${tickets.length}/${storyKeys.length}`);

  const ticketMap = {};
  tickets.forEach((t) => {
    ticketMap[t.jira_key] = t;
  });

  // 2. Recopilar parent_keys (hasta 2 niveles para resolver Épicas)
  const parentKeys = new Set();
  tickets.forEach((t) => {
    if (t.parent_key) parentKeys.add(t.parent_key);
  });

  const parentMap = {};
  if (parentKeys.size > 0) {
    const { data: parents, error: parentError } = await supabaseAdmin
      .from("jira_tickets")
      .select("jira_key, summary, parent_key, issue_type")
      .in("jira_key", [...parentKeys])
      .is("deleted_at", null);

    if (parentError) {
      console.error("❌ Error al leer padres:", parentError.message);
    } else {
      parents.forEach((p) => {
        parentMap[p.jira_key] = p;
      });
    }
  }

  const grandparentKeys = new Set();
  Object.values(parentMap).forEach((p) => {
    if (p.parent_key && !parentMap[p.parent_key]) {
      grandparentKeys.add(p.parent_key);
    }
  });

  if (grandparentKeys.size > 0) {
    const { data: grandparents, error: gpError } = await supabaseAdmin
      .from("jira_tickets")
      .select("jira_key, summary, issue_type")
      .in("jira_key", [...grandparentKeys])
      .is("deleted_at", null);

    if (gpError) {
      console.error("❌ Error al leer abuelos:", gpError.message);
    } else {
      grandparents.forEach((gp) => {
        parentMap[gp.jira_key] = gp;
      });
    }
  }

  function resolveEpic(ticket) {
    if (!ticket || !ticket.parent_key) return null;
    const parent = parentMap[ticket.parent_key];
    if (!parent) return null;
    if (isEpicType(parent.issue_type)) return parent;
    if (parent.parent_key) {
      const gp = parentMap[parent.parent_key];
      if (gp && isEpicType(gp.issue_type)) return gp;
    }
    return null;
  }

  // 3. Construir filas completas para upsert
  const rows = storyKeys.map((key) => {
    const ticket = ticketMap[key];
    const epic = resolveEpic(ticket);
    return {
      story_key: key,
      sprint: SPRINT,
      story_summary: ticket?.summary || null,
      story_points: ticket?.story_points != null ? Number(ticket.story_points) : null,
      epic_key: epic?.jira_key || null,
      epic_summary: epic?.summary || null,
    };
  });

  // 4. Upsert en lotes de 50
  const batchSize = 50;
  let successCount = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    console.log(`Procesando lote ${Math.floor(i / batchSize) + 1} (${batch.length} historias)...`);

    const { error } = await supabaseAdmin
      .from("hu_reportadas")
      .upsert(batch, { onConflict: "story_key" });

    if (error) {
      console.error(`❌ Error en upsert:`, error.message);
      process.exit(1);
    }

    successCount += batch.length;
    console.log(`   ✅ Lote procesado correctamente.`);
  }

  console.log(`\n🎉 ÉXITO: ${successCount} historias marcadas como reportadas en "${SPRINT}".`);

  // 5. Verificación final
  const { data: verification, error: verError } = await supabaseAdmin
    .from("hu_reportadas")
    .select("story_key, story_summary, story_points, epic_key, epic_summary, sprint")
    .eq("sprint", SPRINT)
    .order("story_key", { ascending: true });

  if (verError) {
    console.error("❌ Error en verificación:", verError.message);
    return;
  }

  const complete = verification.filter((r) => r.story_summary);
  const withEpic = verification.filter((r) => r.epic_key);
  const withPoints = verification.filter((r) => r.story_points != null);
  const totalSP = verification.reduce((acc, r) => acc + (Number(r.story_points) || 0), 0);

  console.log(`\n── Verificación Final ──`);
  console.log(`Total historias Sprint 19:  ${verification.length}/${storyKeys.length}`);
  console.log(`Con resumen (summary):      ${complete.length}/${verification.length}`);
  console.log(`Con story points:           ${withPoints.length}/${verification.length} (Total: ${totalSP} SP)`);
  console.log(`Con épica resuelta:         ${withEpic.length}/${verification.length}`);

  const missingEpic = verification.filter((r) => !r.epic_key);
  if (missingEpic.length > 0) {
    console.log(`⚠️ Sin épica (${missingEpic.length}): ${missingEpic.map((r) => r.story_key).join(", ")}`);
  }
  const missingSP = verification.filter((r) => r.story_points == null);
  if (missingSP.length > 0) {
    console.log(`⚠️ Sin story points (${missingSP.length}): ${missingSP.map((r) => r.story_key).join(", ")}`);
  }

  console.log(`\n── Muestra de datos ──`);
  verification.slice(0, 6).forEach((r) => {
    console.log(`  ${r.story_key} | ${(r.story_summary || "").substring(0, 48)}... | SP: ${r.story_points ?? "—"} | Épica: ${r.epic_key || "—"}`);
  });
  if (verification.length > 6) {
    console.log(`  ... (${verification.length - 6} más)`);
  }
}

upsertAndCompleteReportadas().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
