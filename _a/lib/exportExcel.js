/**
 * @file lib/exportExcel.js - Módulo compartido de exportación a Excel
 * @description Genera un Excel unificado con 5 hojas usando shared strings (t="s").
 *
 * Estrategia:
 *   1. Leer sharedStrings.xml original COMO TEXTO (sin parsear entries)
 *   2. Construir datos de sheet2 (Osi) y sheet4 (Datos QA)
 *   3. Buscar strings nuevos en el SST original; si no existen, añadirlos al final
 *   4. Generar sheet XML con t="s" references y s="1" para headers
 *   5. Inyectar sheet2, sheet4 y sharedStrings actualizado
 *   6. NO tocar: styles.xml, pivotTables, pivotCaches (refreshOnLoad reconstruye)
 *
 * Usado por: ReportesTable.js y errores-estadisticas/page.js
 */

import JSZip from "jszip";
import { supabase } from "@/lib/supabase";

const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

/** Escapa caracteres XML */
function escXml(s) {
  return String(s || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convierte índice de columna a letra Excel */
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
 * Gestiona el Shared String Table preservando el XML original intacto.
 * Solo busca strings existentes por texto plano y añade nuevos al final.
 */
class SharedStrings {
  constructor(originalXml) {
    this.originalXml = originalXml || "";

    // Extraer uniqueCount del original
    const ucMatch = this.originalXml.match(/uniqueCount="(\d+)"/);
    this.originalUniqueCount = ucMatch ? parseInt(ucMatch[1]) : 0;

    // Construir mapa de texto → índice buscando en el XML
    // Matcheamos cada <si>...</si> completo para obtener el índice
    this.textToIndex = new Map();
    let idx = 0;
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let match;
    while ((match = siRegex.exec(this.originalXml)) !== null) {
      // Extraer texto plano del contenido del <si>
      const siContent = match[1];
      // Puede ser <t>VALUE</t> o <t/> o rich text <r><t>...</t></r>
      const textParts = [];
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>|<t\/>/g;
      let tMatch;
      while ((tMatch = tRegex.exec(siContent)) !== null) {
        if (tMatch[1] !== undefined) {
          textParts.push(tMatch[1]
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'"));
        }
        // <t/> = empty string, textParts stays empty or gets ""
      }
      const plainText = textParts.join("");
      // Solo guardar primera ocurrencia
      if (!this.textToIndex.has(plainText)) {
        this.textToIndex.set(plainText, idx);
      }
      idx++;
    }
    this.parsedCount = idx;

    // Nuevos strings que se añadirán al final
    this.newEntries = []; // array of escaped XML strings
    this.newEntriesMap = new Map(); // text → index
    this.totalNewRefs = 0;
  }

  /** Obtiene índice de un string. Si no existe, lo añade al final. */
  getIndex(val) {
    const str = String(val ?? "");
    this.totalNewRefs++;

    // Buscar en el SST original
    const existingIdx = this.textToIndex.get(str);
    if (existingIdx !== undefined) return existingIdx;

    // Buscar en los nuevos
    const newIdx = this.newEntriesMap.get(str);
    if (newIdx !== undefined) return newIdx;

    // Añadir nuevo
    const idx = this.parsedCount + this.newEntries.length;
    if (str === "") {
      this.newEntries.push("<si><t/></si>");
    } else {
      this.newEntries.push(`<si><t>${escXml(str)}</t></si>`);
    }
    this.newEntriesMap.set(str, idx);
    return idx;
  }

  /** Genera el XML final, preservando entries originales + añadiendo nuevos */
  toXml() {
    const totalUnique = this.parsedCount + this.newEntries.length;

    // Contar refs de sheets originales (1,3,5) que no modificamos
    // Las contamos de forma conservadora usando totalNewRefs + refs existentes
    const countMatch = this.originalXml.match(/count="(\d+)"/);
    const origCount = countMatch ? parseInt(countMatch[1]) : 0;
    // El count final = refs originales de sheets no tocadas + nuestras nuevas refs
    // Pero no podemos saber exactamente cuántas refs tenían sheet2 y sheet4 originales
    // Solución: usar un count generoso (no afecta funcionalidad)
    const totalCount = this.totalNewRefs + origCount;

    // Reemplazar count y uniqueCount en el tag <sst>
    let xml = this.originalXml;

    // Actualizar uniqueCount
    xml = xml.replace(
      /uniqueCount="\d+"/,
      `uniqueCount="${totalUnique}"`
    );
    // Actualizar count
    xml = xml.replace(
      /count="\d+"/,
      `count="${totalCount}"`
    );

    // Insertar nuevos entries antes del cierre </sst>
    if (this.newEntries.length > 0) {
      xml = xml.replace("</sst>", this.newEntries.join("") + "</sst>");
    }

    return xml;
  }
}

/**
 * Genera XML de worksheet usando shared string references (t="s").
 */
function buildSheetXml(headers, rows, colWidths, sst) {
  const lastCol = colLetter(headers.length - 1);
  const lastRow = rows.length + 1;

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
  xml += `<dimension ref="A1:${lastCol}${lastRow}"/>`;

  if (colWidths.length > 0) {
    xml += "<cols>";
    colWidths.forEach((w, i) => {
      xml += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    });
    xml += "</cols>";
  }

  xml += "<sheetData>";

  // Header row (s="1" = bold colored header, same as original template)
  xml += '<row r="1">';
  headers.forEach((h, c) => {
    const idx = sst.getIndex(h);
    xml += `<c r="${colLetter(c)}1" s="1" t="s"><v>${idx}</v></c>`;
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
        // Celda vacía — no escribir (pivot cache interpreta como blank)
      } else if (typeof val === "number") {
        xml += `<c r="${ref}"><v>${val}</v></c>`;
      } else {
        const idx = sst.getIndex(String(val));
        xml += `<c r="${ref}" t="s"><v>${idx}</v></c>`;
      }
    });
    xml += "</row>";
  });

  xml += "</sheetData>";
  xml += `<autoFilter ref="A1:${lastCol}${lastRow}"/>`;
  xml += "</worksheet>";
  return xml;
}

/**
 * Exporta un Excel unificado con todos los datos y tablas dinámicas.
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
       3. CARGAR TEMPLATE Y PREPARAR SHARED STRINGS
       ═══════════════════════════════════════════════════════════════ */
    const templateRes = await fetch("/templates/reporte_template.xlsx");
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    const origSstXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    const sst = new SharedStrings(origSstXml);

    /* ═══════════════════════════════════════════════════════════════
       4. CONSTRUIR HOJAS DE DATOS
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
    const osiXml = buildSheetXml(headersOsi, rowsOsi,
      [16, 13, 52, 20, 13, 32, 22, 24, 13, 20, 24, 18], sst);

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
    const qaXml = buildSheetXml(headersQA, rowsQA,
      [16, 13, 52, 22, 24, 20, 24], sst);

    /* ═══════════════════════════════════════════════════════════════
       5. INYECTAR EN TEMPLATE
       ═══════════════════════════════════════════════════════════════ */
    zip.file("xl/worksheets/sheet2.xml", osiXml);
    zip.file("xl/worksheets/sheet4.xml", qaXml);
    zip.file("xl/sharedStrings.xml", sst.toXml());

    // NO se toca: styles.xml, pivotCaches, pivotTables
    // refreshOnLoad="1" en ambos caches reconstruye al abrir

    /* ═══════════════════════════════════════════════════════════════
       6. DESCARGAR
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
