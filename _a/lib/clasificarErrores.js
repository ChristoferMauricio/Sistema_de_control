/**
 * @file clasificarErrores.js - Clasificación de tickets PF3QA en Certificación, Desarrollo o Revisión QA
 * @description Lógica compartida para las pestañas de errores. Obtiene todos los tickets PF3QA
 *              (Historias + Errores) y los clasifica según:
 *              - Desarrollo: épica PF3QA-50 O actividad vinculada en sprint F3.03/F3.4/F3.5
 *              - Certificación: épica PF3QA-49 O actividad vinculada en sprint F3.01/F3.02
 *              - Revisión QA: tickets que no caen en ninguna de las categorías anteriores
 */

import { supabase } from "@/lib/supabase";
import { sortSprints } from "@/lib/utils";

/** Patrón para identificar tickets de prueba/revisión (excluidos) */
const EXCLUDE_PATTERN = /revisión cruzada|revision cruzada|pruebas unitarias/i;

/**
 * Obtiene todos los tickets PF3QA (Historias + Errores), los clasifica
 * en certificación, desarrollo o sin clasificar, y retorna agrupados.
 *
 * @returns {Promise<{certificacion: Array, desarrollo: Array, revision: Array, sprints: string[]}>}
 */
export async function fetchAndClassify() {
  // 1. Obtener todos los tickets PF3QA (Historias + Errores)
  const { data: ticketsPF3QA } = await supabase
    .from("jira_tickets")
    .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, comentario, priority, labels")
    .like("jira_key", "PF3QA-%")
    .is("deleted_at", null)
    .in("issue_type", ["Historia", "Bug", "Error", "Error Desarrollo", "Error Certificación", "Error en Certificación"])
    .order("updated_at", { ascending: false });

  if (!ticketsPF3QA || ticketsPF3QA.length === 0) {
    return { certificacion: [], desarrollo: [], revision: [], sprints: [], defaultSprint: "" };
  }

  // 2. Obtener links desde jira_ticket_links
  const keys = ticketsPF3QA.map((t) => t.jira_key);
  const { data: linkRows } = await supabase
    .from("jira_ticket_links")
    .select("source_key, target_key")
    .in("source_key", keys);

  const linksMap = {};
  for (const row of linkRows || []) {
    if (!linksMap[row.source_key]) linksMap[row.source_key] = [];
    linksMap[row.source_key].push(row.target_key);
  }

  // 3. Obtener sprints de tickets vinculados (historias PF3)
  const allTargetKeys = [...new Set(Object.values(linksMap).flat())];
  const linkedSprintMap = {};
  if (allTargetKeys.length > 0) {
    const { data: linkedTickets } = await supabase
      .from("jira_tickets")
      .select("jira_key, sprint")
      .is("deleted_at", null)
      .in("jira_key", allTargetKeys);
    (linkedTickets || []).forEach((st) => {
      linkedSprintMap[st.jira_key] = st.sprint || "";
    });
  }

  // 4. Sprints disponibles (ordenados) + determinar el sprint más alto tipo Tablero
  const sprintSet = new Set(ticketsPF3QA.map((t) => t.sprint).filter(Boolean));
  const sprints = sortSprints([...sprintSet]);
  // El sprint default es el Tablero Sprint más alto (mayor número)
  const tableroSprints = sprints.filter((s) => /Tablero\s+Sprint/i.test(s));
  const defaultSprint = tableroSprints.length > 0
    ? tableroSprints.reduce((a, b) => {
        const numA = parseInt(a.match(/(\d+)/)?.[1]) || 0;
        const numB = parseInt(b.match(/(\d+)/)?.[1]) || 0;
        return numA > numB ? a : b;
      })
    : sprints[0] || "";

  // 5. Clasificar cada ticket
  const certificacion = [];
  const desarrollo = [];
  const revision = [];
  const excluidos = [];

  ticketsPF3QA.forEach((ticket) => {
    const targets = linksMap[ticket.jira_key] || [];
    const linkedSprints = [...new Set(targets.map((tk) => linkedSprintMap[tk]).filter(Boolean))];
    const enriched = { ...ticket, storySprint: linkedSprints.join(", ") || "—" };

    // Tickets excluidos (prueba/revisión) van a su propia categoría
    if (EXCLUDE_PATTERN.test(ticket.summary || "")) {
      excluidos.push(enriched);
      return;
    }

    // Clasificación por épica (prioridad)
    if (ticket.parent_key === "PF3QA-50") { desarrollo.push(enriched); return; }
    if (ticket.parent_key === "PF3QA-49") { certificacion.push(enriched); return; }

    // Clasificación por sprint de actividad vinculada (Iteración F3.XX)
    // Certificación = sprints 01, 02 | Desarrollo = sprints 03 en adelante
    let classified = false;
    for (const tk of targets) {
      const sprint = linkedSprintMap[tk] || "";
      const match = sprint.match(/F3\.(\d+)/);
      if (match) {
        const num = parseInt(match[1]);
        if (num <= 2) { certificacion.push(enriched); }
        else { desarrollo.push(enriched); }
        classified = true;
        break;
      }
    }
    if (classified) return;

    // Sin clasificar → Revisión QA
    revision.push(enriched);
  });

  return { certificacion, desarrollo, revision, excluidos, sprints, defaultSprint };
}
