/**
 * @file lib/exportExcel.js - Módulo compartido de exportación a Excel
 * @description Genera un Excel unificado con 5 hojas:
 *   - "Tabla dinámica": pivot por Persona/Estado (del template, pivots 1+2)
 *   - "Osi": datos crudos de TODOS los tickets (fuente de pivots 1-3)
 *   - "Reporte por Épica": pivot por Épica (del template, pivot 3)
 *   - "Datos QA": datos crudos de tickets PF3QA
 *   - "Reporte QA": 2 tablas dinámicas azules (pivots 4+5)
 *
 * Estrategia:
 *   - Generar hojas de datos como XML con inline strings (t="inlineStr")
 *   - Inyectar SOLO sheet2.xml (Osi) y sheet4.xml (Datos QA)
 *   - NO tocar: styles.xml, sharedStrings.xml, pivotTables, pivotCaches
 *   - Ambos caches del template tienen refreshOnLoad="1" → Excel reconstruye todo
 *
 * Usado por: ReportesTable.js y errores-estadisticas/page.js
 */

import JSZip from "jszip";
import { supabase } from "@/lib/supabase";

const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

/** Escapa caracteres XML y elimina caracteres de control inválidos */
function escXml(s) {
  return String(s || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convierte índice de columna a letra Excel (0→A, 25→Z, 26→AA) */
function colLetter(idx) {
  let s = "";
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

/**
 * Genera XML de worksheet con inline strings (compatible con pivot cache refresh).
 * NO usa shared strings ni style references — evita conflictos con el template.
 */
function buildWorksheetXml(headers, rows, colWidths) {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';

  // Dimension
  const lastCol = colLetter(headers.length - 1);
  const lastRow = rows.length + 1;
  xml += `<dimension ref="A1:${lastCol}${lastRow}"/>`;

  // Column widths
  if (colWidths && colWidths.length > 0) {
    xml += "<cols>";
    colWidths.forEach((w, i) => {
      xml += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    });
    xml += "</cols>";
  }

  xml += "<sheetData>";

  // Header row
  xml += '<row r="1">';
  headers.forEach((h, c) => {
    xml += `<c r="${colLetter(c)}1" t="inlineStr"><is><t>${escXml(h)}</t></is></c>`;
  });
  xml += "</row>";

  // Data rows
  rows.forEach((row, ri) => {
    const r = ri + 2;
    xml += `<row r="${r}">`;
    headers.forEach((h, c) => {
      const ref = `${colLetter(c)}${r}`;
      const val = row[h];
      if (val === "" || val == null) {
        // Empty — skip cell entirely (pivot cache handles missing as blank)
      } else if (typeof val === "number") {
        xml += `<c r="${ref}"><v>${val}</v></c>`;
      } else {
        xml += `<c r="${ref}" t="inlineStr"><is><t>${escXml(String(val))}</t></is></c>`;
      }
    });
    xml += "</row>";
  });

  xml += "</sheetData>";

  // AutoFilter
  xml += `<autoFilter ref="A1:${lastCol}${lastRow}"/>`;

  xml += "</worksheet>";
  return xml;
}

/**
 * Exporta un Excel unificado con todos los datos y tablas dinámicas.
 * @param {string|null} selectedSprint - Sprint seleccionado (para el nombre del archivo)
 */
export async function exportUnifiedExcel(selectedSprint) {
  try {
    /* ═══════════════════════════════════════════════════════════════
       1. OBTENER DATOS DE SUPABASE
       ═══════════════════════════════════════════════════════════════ */
    const [equipoRes, personsRes] = await Promise.all([
      supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
      supabase.from("jira_persons").select("email, display_name"),
    ]);

    let allTickets = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, subtask_keys, comentario, priority")
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error || !data) { hasMore = false; break; }
      allTickets = [...allTickets, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    }

    const equipo = equipoRes.data || [];
    const persons = personsRes.data || [];

    /* ═══════════════════════════════════════════════════════════════
       2. FUNCIONES AUXILIARES
       ═══════════════════════════════════════════════════════════════ */
    const equipoEmailMap = {};
    equipo.forEach((e) => {
      if (e.correo_pgim) equipoEmailMap[e.correo_pgim.toLowerCase()] = e.nombre;
      if (e.correo_gcorp) equipoEmailMap[e.correo_gcorp.toLowerCase()] = e.nombre;
    });
    const equipoKeyMap = {};
    equipo.forEach((e) => {
      if (e.nombre_clave) equipoKeyMap[e.nombre_clave.toLowerCase()] = e.nombre;
    });
    const personsMap = {};
    persons.forEach((p) => {
      if (p.email && p.display_name) personsMap[p.email.toLowerCase()] = p.display_name;
    });

    function resolveName(email) {
      if (!email || email.trim() === "") return "—";
      const key = email.toLowerCase();
      const byEmail = equipoEmailMap[key];
      if (byEmail) return NAME_OVERRIDES[byEmail.toLowerCase()] || byEmail;
      const displayName = personsMap[key] || email;
      const resolved = equipoKeyMap[displayName.toLowerCase()] || displayName;
      return NAME_OVERRIDES[resolved.toLowerCase()] || resolved;
    }

    function resolveEpic(t) {
      if (!t.parent_key) return null;
      const parent = allTickets.find((p) => p.jira_key === t.parent_key);
      if (!parent) return null;
      if (parent.issue_type === "Epic") return parent;
      if (parent.parent_key) {
        const gp = allTickets.find((g) => g.jira_key === parent.parent_key);
        if (gp?.issue_type === "Epic") return gp;
      }
      return null;
    }

    function formatDate(d) {
      return new Date(d).toLocaleString("es-PE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    }

    /* ═══════════════════════════════════════════════════════════════
       3. CONSTRUIR XML DE LAS HOJAS DE DATOS
       ═══════════════════════════════════════════════════════════════ */
    const headersOsi = [
      "Tipo", "Clave", "Resumen", "Subtareas", "Principal",
      "Épica", "Sprint", "Persona asignada", "Story Points",
      "Estado", "Informador", "Creada",
    ];
    const rowsOsi = allTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Subtareas: t.subtask_keys?.join(", ") || "",
      Principal: t.parent_key || "",
      "Épica": resolveEpic(t)?.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      "Story Points": t.story_points != null && t.story_points !== "" ? Number(t.story_points) : "",
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
      Creada: t.created_at ? formatDate(t.created_at) : "",
    }));
    const osiXml = buildWorksheetXml(headersOsi, rowsOsi,
      [16, 13, 52, 20, 13, 32, 22, 24, 13, 20, 24, 18]);

    const headersQA = ["Tipo", "Clave", "Resumen", "Sprint", "Persona asignada", "Estado", "Informador"];
    const pf3qaTickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3QA-"));
    const rowsQA = pf3qaTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
    }));
    const qaXml = buildWorksheetXml(headersQA, rowsQA,
      [16, 13, 52, 22, 24, 20, 24]);

    /* ═══════════════════════════════════════════════════════════════
       4. CARGAR TEMPLATE E INYECTAR SOLO LAS HOJAS DE DATOS
       ═══════════════════════════════════════════════════════════════ */
    const templateRes = await fetch("/templates/reporte_template.xlsx");
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    // Solo reemplazar las hojas de datos — nada más
    zip.file("xl/worksheets/sheet2.xml", osiXml);   // Osi
    zip.file("xl/worksheets/sheet4.xml", qaXml);     // Datos QA

    // NO se toca:
    //   - xl/sharedStrings.xml (las hojas 1,3,5 lo referencian)
    //   - xl/styles.xml (los pivots lo referencian)
    //   - xl/pivotCache/* (refreshOnLoad="1" reconstruye desde datos)
    //   - xl/pivotTables/* (se mantienen del template)

    /* ═══════════════════════════════════════════════════════════════
       5. DESCARGAR
       ═══════════════════════════════════════════════════════════════ */
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toLocaleDateString("es-PE").replace(/\//g, "-");
    a.download = `Reporte_Jira_${selectedSprint ? selectedSprint.replace(/\s+/g, "_") : "Todos"}_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error al exportar Excel:", err);
    alert("Error al generar el Excel. Ver consola para detalles.");
  }
}
