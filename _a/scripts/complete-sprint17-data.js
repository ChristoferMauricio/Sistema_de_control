/**
 * Script: complete-sprint17-data.js
 * Description: Autocompleta los campos de hu_reportadas (story_summary, story_points,
 *              epic_key, epic_summary) para las historias del Sprint 17, usando los
 *              datos existentes en jira_tickets.
 *
 * Uso: node scripts/complete-sprint17-data.js
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

const SPRINT = "Iteración 17";

async function completeData() {
  console.log(`\n=== AUTOCOMPLETAR DATOS HU REPORTADAS - ${SPRINT} ===\n`);

  // 1. Obtener las historias del Sprint 17 en hu_reportadas
  const { data: huRows, error: huError } = await supabaseAdmin
    .from("hu_reportadas")
    .select("id, story_key, story_summary, story_points, epic_key, epic_summary")
    .eq("sprint", SPRINT);

  if (huError) {
    console.error("❌ Error al leer hu_reportadas:", huError.message);
    process.exit(1);
  }

  console.log(`📋 Historias en Sprint 17: ${huRows.length}`);

  // Filtrar solo las que tienen datos faltantes
  const incomplete = huRows.filter(
    (r) => !r.story_summary || r.story_points == null || !r.epic_key
  );
  console.log(`📝 Historias con datos incompletos: ${incomplete.length}`);

  if (incomplete.length === 0) {
    console.log("✅ Todas las historias ya tienen datos completos.");
    return;
  }

  const storyKeys = incomplete.map((r) => r.story_key);

  // 2. Obtener datos de jira_tickets para esas claves
  const { data: tickets, error: ticketError } = await supabaseAdmin
    .from("jira_tickets")
    .select("jira_key, summary, story_points, parent_key, issue_type")
    .in("jira_key", storyKeys)
    .is("deleted_at", null);

  if (ticketError) {
    console.error("❌ Error al leer jira_tickets:", ticketError.message);
    process.exit(1);
  }

  console.log(`🎫 Tickets encontrados en jira_tickets: ${tickets.length}`);

  // Crear mapa de tickets por clave
  const ticketMap = {};
  tickets.forEach((t) => { ticketMap[t.jira_key] = t; });

  // 3. Recopilar todos los parent_keys para resolver épicas (hasta 2 niveles)
  const parentKeys = new Set();
  tickets.forEach((t) => {
    if (t.parent_key) parentKeys.add(t.parent_key);
  });

  // Fetch padres directos
  let parentMap = {};
  if (parentKeys.size > 0) {
    const { data: parents, error: parentError } = await supabaseAdmin
      .from("jira_tickets")
      .select("jira_key, summary, parent_key, issue_type")
      .in("jira_key", [...parentKeys])
      .is("deleted_at", null);

    if (parentError) {
      console.error("❌ Error al leer padres:", parentError.message);
    } else {
      parents.forEach((p) => { parentMap[p.jira_key] = p; });
    }
  }

  // Fetch abuelos (para épicas de 2do nivel)
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
      grandparents.forEach((gp) => { parentMap[gp.jira_key] = gp; });
    }
  }

  // 4. Resolver épica para cada ticket (misma lógica que exportExcel.js)
  function resolveEpic(ticket) {
    if (!ticket || !ticket.parent_key) return null;
    const parent = parentMap[ticket.parent_key];
    if (!parent) return null;
    if (parent.issue_type === "Epic") return parent;
    if (parent.parent_key) {
      const gp = parentMap[parent.parent_key];
      if (gp && gp.issue_type === "Epic") return gp;
    }
    return null;
  }

  // 5. Construir updates
  const updates = [];
  const notFound = [];

  for (const hu of incomplete) {
    const ticket = ticketMap[hu.story_key];
    if (!ticket) {
      notFound.push(hu.story_key);
      continue;
    }

    const epic = resolveEpic(ticket);

    updates.push({
      story_key: hu.story_key,
      sprint: SPRINT,
      story_summary: ticket.summary || null,
      story_points: ticket.story_points != null ? Number(ticket.story_points) : null,
      epic_key: epic?.jira_key || null,
      epic_summary: epic?.summary || null,
    });
  }

  if (notFound.length > 0) {
    console.warn(`\n⚠️ ${notFound.length} historias NO encontradas en jira_tickets:`);
    notFound.forEach((k) => console.warn(`   - ${k}`));
  }

  console.log(`\n📦 Actualizando ${updates.length} historias...`);

  // 6. Upsert en lotes
  const batchSize = 50;
  let successCount = 0;

  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);
    const { error } = await supabaseAdmin
      .from("hu_reportadas")
      .upsert(batch, { onConflict: "story_key" });

    if (error) {
      console.error(`❌ Error en upsert:`, error.message);
      process.exit(1);
    }

    successCount += batch.length;
  }

  console.log(`✅ ${successCount} historias actualizadas correctamente.\n`);

  // 7. Verificación final
  const { data: verification, error: verError } = await supabaseAdmin
    .from("hu_reportadas")
    .select("story_key, story_summary, story_points, epic_key, epic_summary")
    .eq("sprint", SPRINT)
    .order("story_key", { ascending: true });

  if (verError) {
    console.error("❌ Error en verificación:", verError.message);
    return;
  }

  const complete = verification.filter((r) => r.story_summary);
  const withEpic = verification.filter((r) => r.epic_key);
  const withPoints = verification.filter((r) => r.story_points != null);

  console.log(`── Verificación Final ──`);
  console.log(`Total historias Sprint 17:  ${verification.length}`);
  console.log(`Con resumen (summary):      ${complete.length}/${verification.length}`);
  console.log(`Con story points:           ${withPoints.length}/${verification.length}`);
  console.log(`Con épica resuelta:         ${withEpic.length}/${verification.length}`);

  // Mostrar una muestra de los datos
  console.log(`\n── Muestra de datos ──`);
  verification.slice(0, 5).forEach((r) => {
    console.log(`  ${r.story_key} | ${(r.story_summary || "").substring(0, 50)}... | SP: ${r.story_points ?? "—"} | Épica: ${r.epic_key || "—"}`);
  });
  console.log(`  ... (${verification.length - 5} más)`);
}

completeData().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
