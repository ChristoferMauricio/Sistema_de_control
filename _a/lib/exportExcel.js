/**
 * @file lib/exportExcel.js - Módulo compartido de exportación a Excel
 * @description Genera un Excel unificado con 5 hojas usando shared strings (t="s").
 *
 * Hojas (orden final): Reporte Sprint, Reporte por Épica, Osi, Reporte QA, Datos QA
 *
 * Estrategia:
 *   1. Leer sharedStrings.xml original COMO TEXTO (sin parsear entries)
 *   2. Construir datos de sheet2 (Osi) y sheet4 (Datos QA)
 *   3. Buscar strings nuevos en el SST original; si no existen, añadirlos al final
 *   4. Generar sheet XML con t="s" references y s="6" para headers estilizados
 *   5. Inyectar sheet2, sheet4 y sharedStrings actualizado
 *   6. Personalizar template: renombrar hojas, reordenar, estilos, pivot azul
 *
 * Usado por: ReportesTable.js y errores-estadisticas/page.js
 */

import JSZip from "jszip";
import { supabase } from "@/lib/supabase";

const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

/* ═══════════════════════════════════════════════════════════════════════
   UTILIDADES
   ═══════════════════════════════════════════════════════════════════════ */

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

/* ═══════════════════════════════════════════════════════════════════════
   SHARED STRING TABLE
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Gestiona el Shared String Table preservando el XML original intacto.
 * Solo busca strings existentes por texto plano y añade nuevos al final.
 */
class SharedStrings {
  constructor(originalXml) {
    this.originalXml = originalXml || "";

    const ucMatch = this.originalXml.match(/uniqueCount="(\d+)"/);
    this.originalUniqueCount = ucMatch ? parseInt(ucMatch[1]) : 0;

    this.textToIndex = new Map();
    let idx = 0;
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let match;
    while ((match = siRegex.exec(this.originalXml)) !== null) {
      const siContent = match[1];
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
      }
      const plainText = textParts.join("");
      if (!this.textToIndex.has(plainText)) {
        this.textToIndex.set(plainText, idx);
      }
      idx++;
    }
    this.parsedCount = idx;

    this.newEntries = [];
    this.newEntriesMap = new Map();
    this.totalNewRefs = 0;
  }

  getIndex(val) {
    const str = String(val ?? "");
    this.totalNewRefs++;

    const existingIdx = this.textToIndex.get(str);
    if (existingIdx !== undefined) return existingIdx;

    const newIdx = this.newEntriesMap.get(str);
    if (newIdx !== undefined) return newIdx;

    const idx = this.parsedCount + this.newEntries.length;
    if (str === "") {
      this.newEntries.push("<si><t/></si>");
    } else {
      this.newEntries.push(`<si><t>${escXml(str)}</t></si>`);
    }
    this.newEntriesMap.set(str, idx);
    return idx;
  }

  toXml() {
    const totalUnique = this.parsedCount + this.newEntries.length;
    const countMatch = this.originalXml.match(/count="(\d+)"/);
    const origCount = countMatch ? parseInt(countMatch[1]) : 0;
    const totalCount = this.totalNewRefs + origCount;

    let xml = this.originalXml;
    xml = xml.replace(/uniqueCount="\d+"/, `uniqueCount="${totalUnique}"`);
    xml = xml.replace(/count="\d+"/, `count="${totalCount}"`);

    if (this.newEntries.length > 0) {
      xml = xml.replace("</sst>", this.newEntries.join("") + "</sst>");
    }
    return xml;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   GENERADOR DE HOJAS
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Genera XML de worksheet usando shared string references (t="s").
 * @param {string} headerStyle - Índice de estilo para headers (default "6")
 */
function buildSheetXml(headers, rows, colWidths, sst, headerStyle = "6") {
  const lastCol = colLetter(headers.length - 1);
  const lastRow = rows.length + 1;

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
  xml += `<dimension ref="A1:${lastCol}${lastRow}"/>`;

  // Vistas: congelar fila de encabezados
  xml += "<sheetViews>";
  xml += '<sheetView workbookViewId="0">';
  xml += '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>';
  xml += '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
  xml += "</sheetView>";
  xml += "</sheetViews>";

  xml += '<sheetFormatPr defaultRowHeight="15"/>';

  if (colWidths.length > 0) {
    xml += "<cols>";
    colWidths.forEach((w, i) => {
      xml += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    });
    xml += "</cols>";
  }

  xml += "<sheetData>";

  // Header row con estilo personalizado
  xml += '<row r="1" ht="22" customHeight="1">';
  headers.forEach((h, c) => {
    const idx = sst.getIndex(h);
    xml += `<c r="${colLetter(c)}1" s="${headerStyle}" t="s"><v>${idx}</v></c>`;
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

/* ═══════════════════════════════════════════════════════════════════════
   PERSONALIZACIÓN DEL TEMPLATE
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Aplica todas las personalizaciones al template:
 * - Renombrar "Tabla dinámica" → "Reporte Sprint"
 * - Reordenar hojas
 * - Agregar estilo de encabezado mejorado (azul, texto blanco, centrado)
 * - Cambiar pivot tables de Reporte QA a estilo azul (PivotStyleMedium2)
 */
async function customizeTemplate(zip) {
  // ─── A) Renombrar y reordenar hojas ────────────────────────────────
  let wbXml = await zip.file("xl/workbook.xml").async("string");

  // Reemplazar bloque <sheets> completo con nuevo orden y nombre
  wbXml = wbXml.replace(
    /<sheets>[\s\S]*?<\/sheets>/,
    "<sheets>" +
      '<sheet name="Reporte Sprint" sheetId="3" r:id="rId1"/>' +
      '<sheet name="Reporte por Épica" sheetId="4" r:id="rId8"/>' +
      '<sheet name="Osi" sheetId="1" r:id="rId2"/>' +
      '<sheet name="Reporte QA" sheetId="6" r:id="rId10"/>' +
      '<sheet name="Datos QA" sheetId="5" r:id="rId9"/>' +
    "</sheets>"
  );

  // Activar primera pestaña
  wbXml = wbXml.replace(/activeTab="\d+"/, 'activeTab="0"');

  // Osi ahora está en posición 2 (0-based), actualizar localSheetId del filtro
  wbXml = wbXml.replace(/localSheetId="1"/, 'localSheetId="2"');

  zip.file("xl/workbook.xml", wbXml);

  // ─── B) Mejorar estilo de encabezados ──────────────────────────────
  let stylesXml = await zip.file("xl/styles.xml").async("string");

  // Agregar fuente: blanca, negrita, 11pt (fontId=3)
  stylesXml = stylesXml.replace(
    '<fonts count="3"',
    '<fonts count="4"'
  );
  stylesXml = stylesXml.replace(
    "</fonts>",
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>'
  );

  // Agregar relleno: azul corporativo (fillId=3)
  stylesXml = stylesXml.replace(
    '<fills count="3"',
    '<fills count="4"'
  );
  stylesXml = stylesXml.replace(
    "</fills>",
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill></fills>'
  );

  // Agregar borde: línea delgada en los 4 lados (borderId=1)
  stylesXml = stylesXml.replace(
    '<borders count="1"',
    '<borders count="2"'
  );
  stylesXml = stylesXml.replace(
    "</borders>",
    "<border>" +
      '<left style="thin"><color indexed="64"/></left>' +
      '<right style="thin"><color indexed="64"/></right>' +
      '<top style="thin"><color indexed="64"/></top>' +
      '<bottom style="thin"><color indexed="64"/></bottom>' +
      "<diagonal/>" +
    "</border></borders>"
  );

  // Agregar cellXf para encabezados: azul + blanco + centrado + borde (xfId=6)
  stylesXml = stylesXml.replace(
    '<cellXfs count="6"',
    '<cellXfs count="7"'
  );
  stylesXml = stylesXml.replace(
    "</cellXfs>",
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
      '<alignment horizontal="center" vertical="center" wrapText="1"/>' +
    "</xf></cellXfs>"
  );

  zip.file("xl/styles.xml", stylesXml);

  // ─── C) Cambiar pivot tables de Reporte QA a estilo azul ──────────
  for (const ptFile of [
    "xl/pivotTables/pivotTable4.xml",
    "xl/pivotTables/pivotTable5.xml",
  ]) {
    let ptXml = await zip.file(ptFile).async("string");
    ptXml = ptXml.replace(/PivotStyleMedium4/g, "PivotStyleMedium2");
    zip.file(ptFile, ptXml);
  }

  console.log("[exportExcel] ✅ Template personalizado: hojas renombradas/reordenadas, estilos y pivot azul");
}

/* ═══════════════════════════════════════════════════════════════════════
   FUNCIÓN PRINCIPAL DE EXPORTACIÓN
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Exporta un Excel unificado con todos los datos y tablas dinámicas.
 */
export async function exportUnifiedExcel(selectedSprint) {
  try {
    console.log("[exportExcel] ▶ Iniciando exportación...");

    /* ═══════════════════════════════════════════════════════════════
       1. OBTENER DATOS DE SUPABASE
       ═══════════════════════════════════════════════════════════════ */
    const [equipoRes, personsRes] = await Promise.all([
      supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
      supabase.from("jira_persons").select("email, display_name"),
    ]);

    if (equipoRes.error) console.error("[exportExcel] Error equipo:", equipoRes.error);
    if (personsRes.error) console.error("[exportExcel] Error persons:", personsRes.error);

    let allTickets = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, comentario, priority")
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) { console.error("[exportExcel] Supabase error:", error); hasMore = false; break; }
      if (!data || data.length === 0) { hasMore = false; break; }
      allTickets = [...allTickets, ...data];
      console.log(`[exportExcel] Batch ${from}-${from + data.length}: ${data.length} tickets`);
      from += pageSize;
      hasMore = data.length === pageSize;
    }

    // Obtener subtareas desde tabla relacional
    const { data: subtaskRows } = await supabase
      .from("jira_ticket_subtasks")
      .select("parent_key, child_key");
    const subtaskMap = {};
    (subtaskRows || []).forEach((r) => {
      if (!subtaskMap[r.parent_key]) subtaskMap[r.parent_key] = [];
      subtaskMap[r.parent_key].push(r.child_key);
    });

    const equipo = equipoRes.data || [];
    const persons = personsRes.data || [];
    console.log(`[exportExcel] ✅ Datos: ${allTickets.length} tickets, ${equipo.length} equipo, ${persons.length} persons`);

    if (allTickets.length === 0) {
      alert("No se encontraron tickets en la base de datos.");
      return;
    }

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
    const templateRes = await fetch("/templates/reporte_template.xlsx?t=" + Date.now());
    if (!templateRes.ok) {
      throw new Error(`Template fetch failed: ${templateRes.status} ${templateRes.statusText}`);
    }
    const templateBuf = await templateRes.arrayBuffer();
    console.log(`[exportExcel] ✅ Template cargado: ${templateBuf.byteLength} bytes`);

    const zip = await JSZip.loadAsync(templateBuf);

    const origSstXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (!origSstXml) {
      throw new Error("sharedStrings.xml not found in template");
    }
    const sst = new SharedStrings(origSstXml);
    console.log(`[exportExcel] ✅ SST parseado: ${sst.parsedCount} entries originales`);

    /* ═══════════════════════════════════════════════════════════════
       4. CONSTRUIR HOJAS DE DATOS
       ═══════════════════════════════════════════════════════════════ */

    // ─── Hoja "Osi" (sheet2) — todos los tickets ────────────────────
    const headersOsi = [
      "Tipo", "Clave", "Resumen", "Subtareas", "Principal",
      "Épica", "Sprint", "Persona asignada", "Story Points",
      "Estado", "Informador", "Creada",
    ];
    const rowsOsi = allTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Subtareas: (subtaskMap[t.jira_key] || []).join(", "),
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
    console.log(`[exportExcel] ✅ Hoja Osi: ${rowsOsi.length} filas`);

    // ─── Hoja "Datos QA" (sheet4) — tickets PF3QA filtrados ─────────
    const headersQA = ["Tipo", "Clave", "Resumen", "Sprint", "Persona asignada", "Estado", "Informador"];
    const allPf3qaTickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3QA-"));

    // Determinar sprint más reciente entre los QA tickets
    const qaSprints = [...new Set(allPf3qaTickets.map((t) => t.sprint).filter(Boolean))];
    const latestQaSprint = qaSprints.sort((a, b) => {
      const numA = parseInt(a.match(/(\d+)\s*$/)?.[1] || "0");
      const numB = parseInt(b.match(/(\d+)\s*$/)?.[1] || "0");
      return numB - numA;
    })[0] || "";
    console.log(`[exportExcel] Sprint QA más reciente: "${latestQaSprint}"`);

    // Filtrar: solo Historia y Error, solo sprint más reciente
    const QA_TYPES = new Set(["Historia", "Error"]);
    const pf3qaFiltered = allPf3qaTickets.filter(
      (t) => QA_TYPES.has(t.issue_type) && t.sprint === latestQaSprint
    );
    console.log(`[exportExcel] ✅ Datos QA: ${allPf3qaTickets.length} total → ${pf3qaFiltered.length} filtrados (${[...QA_TYPES].join("/")} en "${latestQaSprint}")`);

    const rowsQA = pf3qaFiltered.map((t) => ({
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
       5. INYECTAR DATOS Y PERSONALIZAR TEMPLATE
       ═══════════════════════════════════════════════════════════════ */
    zip.file("xl/worksheets/sheet2.xml", osiXml);
    zip.file("xl/worksheets/sheet4.xml", qaXml);
    zip.file("xl/sharedStrings.xml", sst.toXml());
    console.log(`[exportExcel] ✅ SST final: ${sst.parsedCount + sst.newEntries.length} unique (${sst.newEntries.length} nuevos)`);

    // Personalizar template: renombrar, reordenar, estilos, pivot azul
    await customizeTemplate(zip);

    /* ═══════════════════════════════════════════════════════════════
       6. DESCARGAR
       ═══════════════════════════════════════════════════════════════ */
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    });
    console.log(`[exportExcel] ✅ Excel generado: ${blob.size} bytes`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toLocaleDateString("es-PE").replace(/\//g, "-");
    a.download = `Reporte_Jira_${selectedSprint ? selectedSprint.replace(/\s+/g, "_") : "Todos"}_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("[exportExcel] ✅ Descarga iniciada");
  } catch (err) {
    console.error("Error al exportar Excel:", err);
    alert("Error al generar el Excel. Ver consola para detalles.");
  }
}
