/**
 * @file lib/exportExcel.js - Módulo compartido de exportación a Excel
 * @description Genera un Excel unificado con 5 hojas usando shared strings (t="s").
 *
 * Hojas (orden final): Reporte Sprint, Reporte por Épica, Osi, Reporte QA, Datos QA
 *
 * Estrategia:
 *   1. Cargar template con pivot tables, styles y sharedStrings
 *   2. Inyectar datos en sheet2 (Osi) y sheet4 (Datos QA) con formato t="s"
 *   3. Construir pivot cache QA manualmente (sin refreshOnLoad) para control de filtros
 *   4. Reconstruir pivot tables con filtros: Tipo, Sprint, Estado sin blancos
 *   5. Personalizar: renombrar hojas, reordenar, estilos de encabezado, pivot azul
 *
 * Usado por: ReportesTable.js y errores-estadisticas/page.js
 */

import JSZip from "jszip";
import { supabase } from "@/lib/supabase";

const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

/* ═══════════════════════════════════════════════════════════════════════
   UTILIDADES
   ═══════════════════════════════════════════════════════════════════════ */

function escXml(s) {
  return String(s || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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

class SharedStrings {
  constructor(originalXml) {
    this.originalXml = originalXml || "";
    this.textToIndex = new Map();
    let idx = 0;
    const siRegex = /<si>([\s\S]*?)<\/si>/g;
    let match;
    while ((match = siRegex.exec(this.originalXml)) !== null) {
      const textParts = [];
      const tRegex = /<t[^>]*>([\s\S]*?)<\/t>|<t\/>/g;
      let tMatch;
      while ((tMatch = tRegex.exec(match[1])) !== null) {
        if (tMatch[1] !== undefined) {
          textParts.push(tMatch[1]
            .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"));
        }
      }
      const plainText = textParts.join("");
      if (!this.textToIndex.has(plainText)) this.textToIndex.set(plainText, idx);
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
    this.newEntries.push(str === "" ? "<si><t/></si>" : `<si><t>${escXml(str)}</t></si>`);
    this.newEntriesMap.set(str, idx);
    return idx;
  }

  toXml() {
    const totalUnique = this.parsedCount + this.newEntries.length;
    const countMatch = this.originalXml.match(/count="(\d+)"/);
    const origCount = countMatch ? parseInt(countMatch[1]) : 0;
    let xml = this.originalXml;
    xml = xml.replace(/uniqueCount="\d+"/, `uniqueCount="${totalUnique}"`);
    xml = xml.replace(/count="\d+"/, `count="${this.totalNewRefs + origCount}"`);
    if (this.newEntries.length > 0) xml = xml.replace("</sst>", this.newEntries.join("") + "</sst>");
    return xml;
  }
}

/* ═══════════════════════════════════════════════════════════════════════
   GENERADOR DE HOJAS
   ═══════════════════════════════════════════════════════════════════════ */

function buildSheetXml(headers, rows, colWidths, sst, headerStyle = "6") {
  const lastCol = colLetter(headers.length - 1);
  const lastRow = rows.length + 1;

  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
  xml += `<dimension ref="A1:${lastCol}${lastRow}"/>`;
  xml += "<sheetViews>";
  xml += '<sheetView workbookViewId="0">';
  xml += '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>';
  xml += '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/>';
  xml += "</sheetView></sheetViews>";
  xml += '<sheetFormatPr defaultRowHeight="15"/>';

  if (colWidths.length > 0) {
    xml += "<cols>";
    colWidths.forEach((w, i) => {
      xml += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
    });
    xml += "</cols>";
  }

  xml += "<sheetData>";
  xml += '<row r="1" ht="22" customHeight="1">';
  headers.forEach((h, c) => {
    xml += `<c r="${colLetter(c)}1" s="${headerStyle}" t="s"><v>${sst.getIndex(h)}</v></c>`;
  });
  xml += "</row>";

  rows.forEach((row, ri) => {
    const r = ri + 2;
    xml += `<row r="${r}">`;
    headers.forEach((h, c) => {
      const val = row[h];
      if (val === "" || val == null) return;
      const ref = `${colLetter(c)}${r}`;
      if (typeof val === "number") {
        xml += `<c r="${ref}"><v>${val}</v></c>`;
      } else {
        xml += `<c r="${ref}" t="s"><v>${sst.getIndex(String(val))}</v></c>`;
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
   PIVOT CACHE + PIVOT TABLES QA
   ═══════════════════════════════════════════════════════════════════════ */

/** Orden preferido para las columnas de Estado */
const STATUS_ORDER = [
  "por hacer", "tareas por hacer", "to do",
  "en curso", "in progress",
  "qa", "dev", "cert", "validación", "validacion", "control", "calidad",
  "finalizada", "done", "hecho",
];

/**
 * Construye el pivot cache (definición + records) y ambos pivot tables
 * de la hoja Reporte QA, con filtros aplicados:
 *   - Tipo: solo "Historia" y "Error" seleccionados
 *   - Sprint: solo el sprint más reciente seleccionado
 *   - Estado columnas: "(en blanco)" oculto
 *   - Orden de columnas: Por hacer → En curso → Finalizada
 */
function buildQACacheAndPivots(rowsQA, latestSprint) {
  // ─── 1. Recopilar valores únicos por campo ────────────────────────
  const sets = { tipo: new Set(), sprint: new Set(), asignado: new Set(), estado: new Set(), informador: new Set() };
  const blanks = { tipo: false, sprint: false, asignado: false, estado: false, informador: false };

  rowsQA.forEach((r) => {
    if (r.Tipo) sets.tipo.add(r.Tipo); else blanks.tipo = true;
    if (r.Sprint) sets.sprint.add(r.Sprint); else blanks.sprint = true;
    const a = r["Persona asignada"];
    if (a && a !== "—") sets.asignado.add(a); else blanks.asignado = true;
    if (r.Estado) sets.estado.add(r.Estado); else blanks.estado = true;
    const inf = r.Informador;
    if (inf && inf !== "—") sets.informador.add(inf); else blanks.informador = true;
  });

  const tipoItems = [...sets.tipo].sort();
  const sprintItems = [...sets.sprint].sort((a, b) => {
    const nA = parseInt(a.match(/(\d+)\s*$/)?.[1] || "0");
    const nB = parseInt(b.match(/(\d+)\s*$/)?.[1] || "0");
    return nA - nB;
  });
  const asignadoItems = [...sets.asignado].sort();
  const estadoItems = [...sets.estado].sort((a, b) => {
    const iA = STATUS_ORDER.findIndex((s) => a.toLowerCase().includes(s));
    const iB = STATUS_ORDER.findIndex((s) => b.toLowerCase().includes(s));
    return (iA === -1 ? 999 : iA) - (iB === -1 ? 999 : iB);
  });
  const informadorItems = [...sets.informador].sort();

  console.log(`[exportExcel] Pivot QA — Tipos: [${tipoItems}], Sprints: [${sprintItems}], Estados: [${estadoItems}]`);
  console.log(`[exportExcel] Pivot QA — Asignados: ${asignadoItems.length}, Informadores: ${informadorItems.length}`);

  // ─── 2. Helper: construir sharedItems XML ─────────────────────────
  function makeSI(items, hasBlank, extra = "") {
    const count = items.length + (hasBlank ? 1 : 0);
    let x = `<sharedItems${hasBlank ? ' containsBlank="1"' : ""} count="${count}"${extra}>`;
    items.forEach((v) => { x += `<s v="${escXml(v)}"/>`; });
    if (hasBlank) x += "<m/>";
    x += "</sharedItems>";
    return { xml: x, items, hasBlank, blankIdx: hasBlank ? items.length : -1 };
  }

  const si = {
    tipo: makeSI(tipoItems, blanks.tipo),
    sprint: makeSI(sprintItems, blanks.sprint),
    asignado: makeSI(asignadoItems, blanks.asignado),
    estado: makeSI(estadoItems, blanks.estado),
    informador: makeSI(informadorItems, blanks.informador),
  };

  // ─── 3. Pivot cache definition (SIN refreshOnLoad) ─────────────────
  let defXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  defXml += '<pivotCacheDefinition refreshOnLoad="1" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  defXml += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  defXml += ` r:id="rId1" refreshedBy="Sistema" refreshedDate="46098"`;
  defXml += ` createdVersion="8" refreshedVersion="8" minRefreshableVersion="3"`;
  defXml += ` recordCount="${rowsQA.length}">`;
  defXml += '<cacheSource type="worksheet"><worksheetSource ref="A1:G1048576" sheet="Datos QA"/></cacheSource>';
  defXml += "<cacheFields count=\"7\">";
  defXml += `<cacheField name="Tipo" numFmtId="0">${si.tipo.xml}</cacheField>`;
  defXml += '<cacheField name="Clave" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>';
  defXml += '<cacheField name="Resumen" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>';
  defXml += `<cacheField name="Sprint" numFmtId="0">${si.sprint.xml}</cacheField>`;
  defXml += `<cacheField name="Persona asignada" numFmtId="0">${si.asignado.xml}</cacheField>`;
  defXml += `<cacheField name="Estado" numFmtId="0">${si.estado.xml}</cacheField>`;
  defXml += `<cacheField name="Informador" numFmtId="0">${si.informador.xml}</cacheField>`;
  defXml += "</cacheFields></pivotCacheDefinition>";

  // ─── 4. Pivot cache records ────────────────────────────────────────
  function getIdx(info, val, isBlank) {
    if (isBlank) return info.blankIdx;
    const idx = info.items.indexOf(val);
    return idx >= 0 ? idx : info.blankIdx;
  }

  let recXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  recXml += '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  recXml += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  recXml += ` count="${rowsQA.length}">`;

  rowsQA.forEach((r) => {
    const a = r["Persona asignada"];
    const inf = r.Informador;
    recXml += "<r>";
    recXml += `<x v="${getIdx(si.tipo, r.Tipo, !r.Tipo)}"/>`;
    recXml += `<s v="${escXml(r.Clave)}"/>`;
    recXml += `<s v="${escXml(r.Resumen)}"/>`;
    recXml += `<x v="${getIdx(si.sprint, r.Sprint, !r.Sprint)}"/>`;
    recXml += `<x v="${getIdx(si.asignado, a, !a || a === "—")}"/>`;
    recXml += `<x v="${getIdx(si.estado, r.Estado, !r.Estado)}"/>`;
    recXml += `<x v="${getIdx(si.informador, inf, !inf || inf === "—")}"/>`;
    recXml += "</r>";
  });
  recXml += "</pivotCacheRecords>";

  // ─── 5. Construir items para pivot fields ──────────────────────────
  function makeFieldItems(info, hiddenVals, hideBlank) {
    const count = info.items.length + (info.hasBlank ? 1 : 0) + 1; // +1 default
    let x = `<items count="${count}">`;
    info.items.forEach((v, i) => {
      const h = hiddenVals.has(v) ? ' h="1"' : "";
      x += `<item${h} x="${i}"/>`;
    });
    if (info.hasBlank) {
      x += `<item${hideBlank ? ' h="1"' : ""} x="${info.blankIdx}"/>`;
    }
    x += '<item t="default"/>';
    x += "</items>";
    return x;
  }

  // Filtros: ocultar todo excepto Historia/Error en Tipo
  const tipoHidden = new Set(tipoItems.filter((v) => v !== "Historia" && v !== "Error"));
  // Filtros: ocultar todos los sprints excepto el más reciente
  const sprintHidden = new Set(sprintItems.filter((v) => v !== latestSprint));

  // Items para cada campo
  const tipoFieldItems = makeFieldItems(si.tipo, tipoHidden, true);
  const sprintFieldItems = makeFieldItems(si.sprint, sprintHidden, true);
  const asignadoFieldItems = makeFieldItems(si.asignado, new Set(), true);
  const estadoFieldItems = makeFieldItems(si.estado, new Set(), true); // solo ocultar blank
  const informadorFieldItems = makeFieldItems(si.informador, new Set(), true);

  // ─── 6. Calcular rowItems y colItems ───────────────────────────────
  // colItems: columnas visibles de Estado (sin blank)
  const visibleEstado = estadoItems; // blank está oculto
  let colItemsXml = `<colItems count="${visibleEstado.length + 1}">`;
  visibleEstado.forEach((_, i) => { colItemsXml += `<i><x v="${i}"/></i>`; });
  colItemsXml += '<i t="grand"><x/></i></colItems>';

  // colFields (mismo para ambas tablas)
  const colFieldsXml = '<colFields count="1"><field x="5"/></colFields>';

  // rowItems para PT4 (Informador, campo 6)
  const visibleInformador = informadorItems; // blank oculto
  let rowItemsPT4 = `<rowItems count="${visibleInformador.length + 1}">`;
  visibleInformador.forEach((_, i) => { rowItemsPT4 += `<i><x v="${i}"/></i>`; });
  rowItemsPT4 += '<i t="grand"><x/></i></rowItems>';

  // rowItems para PT5 (Asignado, campo 4)
  const visibleAsignado = asignadoItems; // blank oculto
  let rowItemsPT5 = `<rowItems count="${visibleAsignado.length + 1}">`;
  visibleAsignado.forEach((_, i) => { rowItemsPT5 += `<i><x v="${i}"/></i>`; });
  rowItemsPT5 += '<i t="grand"><x/></i></rowItems>';

  // ─── 7. Generar XML de PT4 (TablaQA_Informador) ───────────────────
  const ptAttrs =
    ' applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0"' +
    ' applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1"' +
    ' dataCaption="Valores" updatedVersion="8" minRefreshableVersion="3"' +
    ' useAutoFormatting="1" itemPrintTitles="1" createdVersion="8"' +
    ' indent="0" outline="1" outlineData="1" multipleFieldFilters="0"';
  const styleXml = '<pivotTableStyleInfo name="PivotStyleMedium2" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>';
  const pageFieldsXml = '<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="3" hier="-1"/></pageFields>';
  const dataFieldXml = '<dataFields count="1"><dataField name="Cuenta de Clave" fld="1" subtotal="count" baseField="0" baseItem="0"/></dataFields>';

  let pt4 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  pt4 += `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="TablaQA_Informador" cacheId="1"${ptAttrs}>`;
  pt4 += '<location ref="A4:E6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>';
  pt4 += "<pivotFields count=\"7\">";
  pt4 += `<pivotField axis="axisPage" multipleItemSelectionAllowed="1" showAll="0">${tipoFieldItems}</pivotField>`;
  pt4 += '<pivotField dataField="1" showAll="0"/>';
  pt4 += '<pivotField showAll="0"/>';
  pt4 += `<pivotField axis="axisPage" multipleItemSelectionAllowed="1" showAll="0">${sprintFieldItems}</pivotField>`;
  pt4 += '<pivotField showAll="0"/>'; // Asignado no usado en PT4
  pt4 += `<pivotField axis="axisCol" showAll="0">${estadoFieldItems}</pivotField>`;
  pt4 += `<pivotField axis="axisRow" showAll="0">${informadorFieldItems}</pivotField>`;
  pt4 += "</pivotFields>";
  pt4 += '<rowFields count="1"><field x="6"/></rowFields>';
  pt4 += rowItemsPT4;
  pt4 += colFieldsXml;
  pt4 += colItemsXml;
  pt4 += pageFieldsXml;
  pt4 += dataFieldXml;
  pt4 += styleXml;
  pt4 += "</pivotTableDefinition>";

  // ─── 8. Generar XML de PT5 (TablaQA_Asignado) ─────────────────────
  let pt5 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  pt5 += `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="TablaQA_Asignado" cacheId="1"${ptAttrs}>`;
  pt5 += '<location ref="I4:M6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>';
  pt5 += "<pivotFields count=\"7\">";
  pt5 += `<pivotField axis="axisPage" multipleItemSelectionAllowed="1" showAll="0">${tipoFieldItems}</pivotField>`;
  pt5 += '<pivotField dataField="1" showAll="0"/>';
  pt5 += '<pivotField showAll="0"/>';
  pt5 += `<pivotField axis="axisPage" multipleItemSelectionAllowed="1" showAll="0">${sprintFieldItems}</pivotField>`;
  pt5 += `<pivotField axis="axisRow" showAll="0">${asignadoFieldItems}</pivotField>`; // Asignado ES row en PT5
  pt5 += `<pivotField axis="axisCol" showAll="0">${estadoFieldItems}</pivotField>`;
  pt5 += '<pivotField showAll="0"/>'; // Informador no usado en PT5
  pt5 += "</pivotFields>";
  pt5 += '<rowFields count="1"><field x="4"/></rowFields>';
  pt5 += rowItemsPT5;
  pt5 += colFieldsXml;
  pt5 += colItemsXml;
  pt5 += pageFieldsXml;
  pt5 += dataFieldXml;
  pt5 += styleXml;
  pt5 += "</pivotTableDefinition>";

  return { cacheDefXml: defXml, cacheRecXml: recXml, pt4Xml: pt4, pt5Xml: pt5 };
}

/* ═══════════════════════════════════════════════════════════════════════
   PERSONALIZACIÓN DEL TEMPLATE
   ═══════════════════════════════════════════════════════════════════════ */

async function customizeTemplate(zip) {
  // ─── A) Renombrar y reordenar hojas ────────────────────────────────
  let wbXml = await zip.file("xl/workbook.xml").async("string");
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
  wbXml = wbXml.replace(/activeTab="\d+"/, 'activeTab="0"');
  wbXml = wbXml.replace(/localSheetId="1"/, 'localSheetId="2"');
  zip.file("xl/workbook.xml", wbXml);

  // ─── B) Mejorar estilo de encabezados ──────────────────────────────
  let sty = await zip.file("xl/styles.xml").async("string");

  // fontId=3: blanca, negrita
  sty = sty.replace('<fonts count="3"', '<fonts count="4"');
  sty = sty.replace("</fonts>",
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>');

  // fillId=3: azul corporativo
  sty = sty.replace('<fills count="3"', '<fills count="4"');
  sty = sty.replace("</fills>",
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill></fills>');

  // borderId=1: borde delgado
  sty = sty.replace('<borders count="1"', '<borders count="2"');
  sty = sty.replace("</borders>",
    "<border>" +
    '<left style="thin"><color indexed="64"/></left>' +
    '<right style="thin"><color indexed="64"/></right>' +
    '<top style="thin"><color indexed="64"/></top>' +
    '<bottom style="thin"><color indexed="64"/></bottom>' +
    "<diagonal/></border></borders>");

  // xfId=6: encabezado azul + blanco + centrado + borde
  sty = sty.replace('<cellXfs count="6"', '<cellXfs count="7"');
  sty = sty.replace("</cellXfs>",
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
    '<alignment horizontal="center" vertical="center" wrapText="1"/>' +
    "</xf></cellXfs>");

  zip.file("xl/styles.xml", sty);
  console.log("[exportExcel] ✅ Template personalizado");
}

/* ═══════════════════════════════════════════════════════════════════════
   FUNCIÓN PRINCIPAL DE EXPORTACIÓN
   ═══════════════════════════════════════════════════════════════════════ */

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
        .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, comentario, priority, labels")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) { console.error("[exportExcel] Supabase error:", error); hasMore = false; break; }
      if (!data || data.length === 0) { hasMore = false; break; }
      allTickets = [...allTickets, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    }

    const subtaskMap = {};
    allTickets.forEach((t) => {
      if (t.parent_key) {
        if (!subtaskMap[t.parent_key]) subtaskMap[t.parent_key] = [];
        subtaskMap[t.parent_key].push(t.jira_key);
      }
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

    function resolveParentStory(t) {
      if (!t.parent_key) return null;
      const parent = allTickets.find((p) => p.jira_key === t.parent_key);
      if (!parent) return null;
      if (parent.issue_type === "Historia" || parent.issue_type === "Story") return parent;
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
    if (!templateRes.ok) throw new Error(`Template fetch failed: ${templateRes.status}`);
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    const origSstXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (!origSstXml) throw new Error("sharedStrings.xml not found");
    const sst = new SharedStrings(origSstXml);
    console.log(`[exportExcel] ✅ Template: ${templateBuf.byteLength} bytes, SST: ${sst.parsedCount} entries`);

    /* ═══════════════════════════════════════════════════════════════
       4. CONSTRUIR HOJAS DE DATOS
       ═══════════════════════════════════════════════════════════════ */

    // ─── Hoja "Osi" (sheet2) — todos los tickets ────────────────────
    const headersOsi = [
      "Tipo", "Clave", "Resumen", "Subtareas", "Principal",
      "Épica", "Historia", "Sprint", "Persona asignada", "Story Points",
      "Estado", "Informador", "Creada", "Etiquetas",
    ];
    const rowsOsi = allTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Subtareas: (subtaskMap[t.jira_key] || []).join(", "),
      Principal: t.parent_key || "",
      "Épica": resolveEpic(t)?.summary || "",
      Historia: resolveParentStory(t)?.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      "Story Points": t.story_points != null && t.story_points !== "" ? Number(t.story_points) : "",
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
      Creada: t.created_at ? formatDate(t.created_at) : "",
      Etiquetas: Array.isArray(t.labels) ? t.labels.join(", ") : "",
    }));
    const osiXml = buildSheetXml(headersOsi, rowsOsi,
      [16, 13, 52, 20, 13, 32, 40, 22, 24, 13, 20, 24, 18, 20], sst);
    console.log(`[exportExcel] ✅ Hoja Osi: ${rowsOsi.length} filas`);

    // ─── Hoja "Datos QA" (sheet4) — TODOS los tickets PF3QA ────────
    const headersQA = ["Tipo", "Clave", "Resumen", "Sprint", "Persona asignada", "Estado", "Informador", "Etiquetas"];
    const pf3qaTickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3QA-"));

    // ─── Determinar sprints por tablero (PF3 vs PF3QA) ────────────
    const extractSprintNum = (s) => parseInt(s.match(/(\d+)\s*$/)?.[1] || "0");
    const sortByNumDesc = (a, b) => extractSprintNum(b) - extractSprintNum(a);

    // Sprint QA: siempre el más alto de los tickets PF3QA ("Tablero Sprint X")
    const qaSprints = [...new Set(pf3qaTickets.map((t) => t.sprint).filter(Boolean))].sort(sortByNumDesc);
    const sprintParaQA = qaSprints[0] || "";

    // Sprint PF3: usa selectedSprint si fue proporcionado, sino el más alto de PF3
    const pf3Tickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3-"));
    const pf3Sprints = [...new Set(pf3Tickets.map((t) => t.sprint).filter(Boolean))].sort(sortByNumDesc);
    const sprintParaPF3 = selectedSprint || pf3Sprints[0] || "";

    console.log(`[exportExcel] Sprint PF3: "${sprintParaPF3}", Sprint QA: "${sprintParaQA}"`);

    const rowsQA = pf3qaTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
      Etiquetas: Array.isArray(t.labels) ? t.labels.join(", ") : "",
    }));
    const qaXml = buildSheetXml(headersQA, rowsQA,
      [16, 13, 52, 22, 24, 20, 24, 20], sst);
    console.log(`[exportExcel] ✅ Hoja QA: ${rowsQA.length} filas (todos los PF3QA)`);

    /* ═══════════════════════════════════════════════════════════════
       5. CONSTRUIR PIVOT CACHE + PIVOT TABLES QA
       ═══════════════════════════════════════════════════════════════ */
    const qaPivot = buildQACacheAndPivots(rowsQA, sprintParaQA);

    /* ═══════════════════════════════════════════════════════════════
       6. INYECTAR TODO EN TEMPLATE
       ═══════════════════════════════════════════════════════════════ */
    // Hojas de datos
    zip.file("xl/worksheets/sheet2.xml", osiXml);
    zip.file("xl/worksheets/sheet4.xml", qaXml);
    zip.file("xl/sharedStrings.xml", sst.toXml());

    // Pivot cache y tables QA (cache 2)
    zip.file("xl/pivotCache/pivotCacheDefinition2.xml", qaPivot.cacheDefXml);
    zip.file("xl/pivotCache/pivotCacheRecords2.xml", qaPivot.cacheRecXml);
    zip.file("xl/pivotTables/pivotTable4.xml", qaPivot.pt4Xml);
    zip.file("xl/pivotTables/pivotTable5.xml", qaPivot.pt5Xml);

    console.log(`[exportExcel] ✅ Pivot QA: cache + 2 tablas inyectadas con filtros`);

    // Personalizar template (nombres, orden, estilos)
    await customizeTemplate(zip);

    /* ═══════════════════════════════════════════════════════════════
       7. DESCARGAR
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
