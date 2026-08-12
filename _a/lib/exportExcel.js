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
import { normalizeStatus } from "@/lib/utils";

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

function buildSheetXml(headers, rows, colWidths, sst, headerStyle = "6", hiddenCols = new Set(), customHeaderStyles = {}, autoFilterXml = "") {
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
      const h = hiddenCols.has(i) ? ' hidden="1"' : '';
      xml += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${h}/>`;
    });
    xml += "</cols>";
  }

  xml += "<sheetData>";
  xml += '<row r="1" ht="22" customHeight="1">';
  headers.forEach((h, c) => {
    const style = customHeaderStyles[h] || headerStyle;
    xml += `<c r="${colLetter(c)}1" s="${style}" t="s"><v>${sst.getIndex(h)}</v></c>`;
  });
  xml += "</row>";

  rows.forEach((row, ri) => {
    const r = ri + 2;
    const hAttr = row._hidden ? ' hidden="1"' : '';
    xml += `<row r="${r}"${hAttr}>`;
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
  if (autoFilterXml) {
    xml += `<autoFilter ref="A1:${lastCol}${lastRow}">${autoFilterXml}</autoFilter>`;
  } else {
    xml += `<autoFilter ref="A1:${lastCol}${lastRow}"/>`;
  }
  xml += "</worksheet>";
  return xml;
}

/* ═══════════════════════════════════════════════════════════════════════
   PIVOT CACHE + PIVOT TABLES OSI (PF3)
   ═══════════════════════════════════════════════════════════════════════
   Columnas Osi (17): Tipo(0), Clave(1), Resumen(2), Subtareas(3),
   Principal(4), Épica(5), Codigo HU(6), Historia(7), Sprint(8),
   Persona asignada(9), Story Points(10), Estado(11), Informador(12),
   Creada(13), Etiquetas(14), Sprint Creado(15), HU Reportada(16)
   ═══════════════════════════════════════════════════════════════════════ */

function buildOsiCacheAndPivots(rowsOsi, latestSprint, exclusionsSet) {
  // 1. Recopilar valores únicos por campo
  const sets = { tipo: new Set(), sprint: new Set(), asignado: new Set(), estado: new Set(), epica: new Set(), etiquetas: new Set(), sprintCreado: new Set() };
  const blanks = { tipo: false, sprint: false, asignado: false, estado: false, epica: false, etiquetas: false, sprintCreado: false };

  rowsOsi.forEach((r) => {
    if (r.Tipo) sets.tipo.add(r.Tipo); else blanks.tipo = true;
    if (r.Sprint) sets.sprint.add(r.Sprint); else blanks.sprint = true;
    const a = r["Persona asignada"];
    if (a && a !== "—") sets.asignado.add(a); else blanks.asignado = true;
    if (r.Estado) sets.estado.add(r.Estado); else blanks.estado = true;
    const ep = r["Épica"];
    if (ep) sets.epica.add(ep); else blanks.epica = true;
    if (r.Etiquetas) sets.etiquetas.add(r.Etiquetas); else blanks.etiquetas = true;
    const sc = r["Sprint Creado"];
    if (sc) sets.sprintCreado.add(sc); else blanks.sprintCreado = true;
  });

  const tipoItems = [...sets.tipo].sort();
  const extractNum = (s) => parseInt(s.match(/(\d+)\s*$/)?.[1] || "0");
  const sprintItems = [...sets.sprint].sort((a, b) => extractNum(a) - extractNum(b));
  const asignadoItems = [...sets.asignado].sort();
  const estadoItems = [...sets.estado].sort((a, b) => {
    const iA = STATUS_ORDER.findIndex((s) => a.toLowerCase().includes(s));
    const iB = STATUS_ORDER.findIndex((s) => b.toLowerCase().includes(s));
    return (iA === -1 ? 999 : iA) - (iB === -1 ? 999 : iB);
  });
  const epicaItems = [...sets.epica].sort();
  const etiquetasItems = [...sets.etiquetas].sort();
  const sprintCreadoItems = [...sets.sprintCreado].sort((a, b) => extractNum(a) - extractNum(b));



  // 2. SharedItems helper
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
    epica: makeSI(epicaItems, blanks.epica),
    etiquetas: makeSI(etiquetasItems, blanks.etiquetas),
    sprintCreado: makeSI(sprintCreadoItems, blanks.sprintCreado),
  };

  // 3. Pivot cache definition — 17 fields matching Osi columns
  let defXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  defXml += '<pivotCacheDefinition refreshOnLoad="1" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  defXml += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  defXml += ` r:id="rId1" refreshedBy="Sistema" refreshedDate="46098"`;
  defXml += ` createdVersion="8" refreshedVersion="8" minRefreshableVersion="3"`;
  defXml += ` recordCount="${rowsOsi.length}">`;
  defXml += '<cacheSource type="worksheet"><worksheetSource ref="A1:Q1048576" sheet="Osi"/></cacheSource>';
  defXml += '<cacheFields count="17">';
  defXml += `<cacheField name="Tipo" numFmtId="0">${si.tipo.xml}</cacheField>`;                    // 0
  defXml += '<cacheField name="HU Reportada" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 1
  defXml += '<cacheField name="Clave" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>';  // 2
  defXml += '<cacheField name="Resumen" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>'; // 3
  defXml += '<cacheField name="Subtareas" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 4
  defXml += '<cacheField name="Principal" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 5
  defXml += `<cacheField name="Épica" numFmtId="0">${si.epica.xml}</cacheField>`;                  // 6
  defXml += '<cacheField name="Codigo HU" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 7
  defXml += '<cacheField name="Historia" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 8
  defXml += `<cacheField name="Sprint" numFmtId="0">${si.sprint.xml}</cacheField>`;                // 9
  defXml += `<cacheField name="Persona asignada" numFmtId="0">${si.asignado.xml}</cacheField>`;    // 10
  defXml += '<cacheField name="Story Points" numFmtId="0"><sharedItems containsBlank="1" containsMixedTypes="1" containsNumber="1" containsInteger="1" minValue="1" maxValue="20"/></cacheField>'; // 11
  defXml += `<cacheField name="Estado" numFmtId="0">${si.estado.xml}</cacheField>`;                // 12
  defXml += '<cacheField name="Informador" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 13
  defXml += '<cacheField name="Creada" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 14
  defXml += `<cacheField name="Etiquetas" numFmtId="0">${si.etiquetas.xml}</cacheField>`;                // 15
  defXml += `<cacheField name="Sprint Creado" numFmtId="0">${si.sprintCreado.xml}</cacheField>`; // 16
  defXml += '</cacheFields></pivotCacheDefinition>';

  // 4. Pivot cache records
  function getIdx(info, val, isBlank) {
    if (isBlank) return info.blankIdx;
    const idx = info.items.indexOf(val);
    return idx >= 0 ? idx : info.blankIdx;
  }

  let recXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  recXml += '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  recXml += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  recXml += ` count="${rowsOsi.length}">`;
  rowsOsi.forEach((r) => {
    const a = r["Persona asignada"];
    const ep = r["Épica"];
    const sp = r["Story Points"];
    recXml += "<r>";
    recXml += `<x v="${getIdx(si.tipo, r.Tipo, !r.Tipo)}"/>`;         // 0 Tipo
    recXml += `<s v="${escXml(r["HU Reportada"])}"/>`;                // 1 HU Reportada
    recXml += `<s v="${escXml(r.Clave)}"/>`;                          // 2 Clave
    recXml += `<s v="${escXml(r.Resumen)}"/>`;                        // 3 Resumen
    recXml += `<s v="${escXml(r.Subtareas)}"/>`;                      // 4 Subtareas
    recXml += `<s v="${escXml(r.Principal)}"/>`;                      // 5 Principal
    recXml += `<x v="${getIdx(si.epica, ep, !ep)}"/>`;                 // 6 Épica
    recXml += `<s v="${escXml(r["Codigo HU"])}"/>`;                    // 7 Codigo HU
    recXml += `<s v="${escXml(r.Historia)}"/>`;                        // 8 Historia
    recXml += `<x v="${getIdx(si.sprint, r.Sprint, !r.Sprint)}"/>`;    // 9 Sprint
    recXml += `<x v="${getIdx(si.asignado, a, !a || a === "—")}"/>`;   // 10 Asignado
    if (sp === "" || sp == null) recXml += "<m/>";                     // 11 SP
    else recXml += `<n v="${sp}"/>`;
    recXml += `<x v="${getIdx(si.estado, r.Estado, !r.Estado)}"/>`;    // 12 Estado
    recXml += `<s v="${escXml(r.Informador)}"/>`;                      // 13 Informador
    recXml += `<s v="${escXml(r.Creada)}"/>`;                          // 14 Creada
    recXml += `<x v="${getIdx(si.etiquetas, r.Etiquetas, !r.Etiquetas)}"/>`;   // 15 Etiquetas
    recXml += `<x v="${getIdx(si.sprintCreado, r["Sprint Creado"], !r["Sprint Creado"])}"/>`; // 16 Sprint Creado
    recXml += "</r>";
  });
  recXml += "</pivotCacheRecords>";

  // 5. Build field items for pivot tables
  function makeFieldItems(info, hiddenVals, hideBlank) {
    const count = info.items.length + (info.hasBlank ? 1 : 0) + 1;
    let x = `<items count="${count}">`;
    info.items.forEach((v, i) => {
      const h = hiddenVals.has(v) ? ' h="1"' : "";
      x += `<item${h} x="${i}"/>`;
    });
    if (info.hasBlank) x += `<item${hideBlank ? ' h="1"' : ""} x="${info.blankIdx}"/>`;
    x += '<item t="default"/></items>';
    return x;
  }

  // Filtros: Tipo = solo Historia visible
  const tipoHidden = new Set(tipoItems.filter((v) => v !== "Historia"));
  // Sprint = solo el seleccionado
  const sprintHidden = new Set(sprintItems.filter((v) => v !== latestSprint));
  // Etiquetas = desmarcar cualquier valor que contenga "No_Reportar"
  const etiquetasHidden = new Set(etiquetasItems.filter((v) => v.includes("No_Reportar")));

  // Sprint Creado:
  // - Para Sprint Actual: ocultar todos los sprints de creación excepto el seleccionado
  const sprintCreadoHiddenActual = new Set(sprintCreadoItems.filter((v) => v !== latestSprint));
  // - Para Deuda Técnica: ocultar ÚNICAMENTE el sprint seleccionado (mostrando solo los creados anteriormente)
  const sprintCreadoHiddenDeuda = new Set(sprintCreadoItems.filter((v) => v === latestSprint));

  // Items para cada campo
  const estadoFieldItems = makeFieldItems(si.estado, new Set(), true);
  const tipoFieldItems = makeFieldItems(si.tipo, tipoHidden, true);
  const sprintFieldItems = makeFieldItems(si.sprint, sprintHidden, true);
  const asignadoHidden = new Set(asignadoItems.filter((v) => v === "Supervisor de Servicio"));
  const asignadoFieldItems = makeFieldItems(si.asignado, asignadoHidden, true);
  const epicaFieldItems = makeFieldItems(si.epica, new Set(), false);
  const etiquetasFieldItems = makeFieldItems(si.etiquetas, etiquetasHidden, false);
  const sprintCreadoFieldItemsActual = makeFieldItems(si.sprintCreado, sprintCreadoHiddenActual, true);
  const sprintCreadoFieldItemsDeuda = makeFieldItems(si.sprintCreado, sprintCreadoHiddenDeuda, true);

  const ptAttrs =
    ' applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0"' +
    ' applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1"' +
    ' dataCaption="Valores" updatedVersion="8" minRefreshableVersion="3"' +
    ' useAutoFormatting="1" itemPrintTitles="1" createdVersion="8"' +
    ' indent="0" outline="1" outlineData="1" multipleFieldFilters="0"';
  const styleXml = '<pivotTableStyleInfo name="PivotStyleMedium4" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>';

  // Visible estado items for colItems
  const visibleEstado = estadoItems;
  let colItemsEstado = `<colItems count="${visibleEstado.length + 1}">`;
  visibleEstado.forEach((_, i) => { colItemsEstado += `<i><x v="${i}"/></i>`; });
  colItemsEstado += '<i t="grand"><x/></i></colItems>';

  // Visible asignado for rowItems (excluir "Supervisor de Servicio")
  const visibleAsignado = asignadoItems.filter((v) => !asignadoHidden.has(v));
  let rowItemsAsignado = `<rowItems count="${visibleAsignado.length + 1}">`;
  visibleAsignado.forEach((v) => {
    const idx = asignadoItems.indexOf(v);
    rowItemsAsignado += `<i><x v="${idx}"/></i>`;
  });
  rowItemsAsignado += '<i t="grand"><x/></i></rowItems>';

  // Visible epicas for rowItems
  const visibleEpica = epicaItems;
  let rowItemsEpica = `<rowItems count="${visibleEpica.length + 1}">`;
  visibleEpica.forEach((_, i) => { rowItemsEpica += `<i><x v="${i}"/></i>`; });
  rowItemsEpica += '<i t="grand"><x/></i></rowItems>';

  function pf(role, items) { return `<pivotField${role} showAll="0">${items}</pivotField>`; }
  const pfSimple = '<pivotField showAll="0"/>';

  // Page fields: Tipo(0), Sprint(9), Etiquetas(15)
  const pageFields4 = '<pageFields count="3"><pageField fld="0" hier="-1"/><pageField fld="9" hier="-1"/><pageField fld="15" hier="-1"/></pageFields>';
  const dataFields1 = '<dataFields count="1"><dataField name="Cuenta de Clave" fld="2" subtotal="count" baseField="0" baseItem="0"/></dataFields>';
  const dataFields2 = '<dataFields count="1"><dataField name="Suma de Story Points" fld="11" baseField="10" baseItem="0"/></dataFields>';

  // --- PT1: TablaDinámica2 — Sprint Actual (HU count) ---
  let pt1 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  pt1 += `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="TablaDinámica2" cacheId="0"${ptAttrs}>`;
  pt1 += '<location ref="A8:F18" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="4" colPageCount="2"/>';
  pt1 += '<pivotFields count="17">';
  pt1 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', tipoFieldItems);  // 0 Tipo
  pt1 += pfSimple;  // 1 HU Reportada
  pt1 += '<pivotField dataField="1" showAll="0"/>';                                 // 2 Clave
  pt1 += pfSimple;  // 3 Resumen
  pt1 += pfSimple;  // 4 Subtareas
  pt1 += pfSimple;  // 5 Principal
  pt1 += pfSimple;  // 6 Épica
  pt1 += pfSimple;  // 7 Codigo HU
  pt1 += pfSimple;  // 8 Historia
  pt1 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', sprintFieldItems); // 9 Sprint
  pt1 += pf(' axis="axisRow"', asignadoFieldItems);                                 // 10 Asignado
  pt1 += pfSimple;  // 11 Story Points
  pt1 += pf(' axis="axisCol"', estadoFieldItems);                                   // 12 Estado
  pt1 += pfSimple;  // 13 Informador
  pt1 += pfSimple;  // 14 Creada
  pt1 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', etiquetasFieldItems); // 15 Etiquetas
  pt1 += pfSimple;  // 16 Sprint Creado
  pt1 += '</pivotFields>';
  pt1 += '<rowFields count="1"><field x="10"/></rowFields>';
  pt1 += rowItemsAsignado;
  pt1 += '<colFields count="1"><field x="12"/></colFields>';
  pt1 += colItemsEstado;
  pt1 += pageFields4;
  pt1 += dataFields1;
  pt1 += styleXml;
  pt1 += '</pivotTableDefinition>';

  // --- PT2: TablaDinámica3 — Sprint Actual (SP sum) ---
  let pt2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  pt2 += `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="TablaDinámica3" cacheId="0"${ptAttrs}>`;
  pt2 += '<location ref="I8:N18" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="4" colPageCount="2"/>';
  pt2 += '<pivotFields count="17">';
  pt2 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', tipoFieldItems);  // 0 Tipo
  pt2 += pfSimple;  // 1 HU Reportada
  pt2 += pfSimple;  // 2 Clave
  pt2 += pfSimple;  // 3 Resumen
  pt2 += pfSimple;  // 4 Subtareas
  pt2 += pfSimple;  // 5 Principal
  pt2 += pfSimple;  // 6 Épica
  pt2 += pfSimple;  // 7 Codigo HU
  pt2 += pfSimple;  // 8 Historia
  pt2 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', sprintFieldItems); // 9 Sprint
  pt2 += pf(' axis="axisRow"', asignadoFieldItems);                                 // 10 Asignado
  pt2 += '<pivotField dataField="1" showAll="0"/>';                                 // 11 Story Points
  pt2 += pf(' axis="axisCol"', estadoFieldItems);                                   // 12 Estado
  pt2 += pfSimple;  // 13 Informador
  pt2 += pfSimple;  // 14 Creada
  pt2 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', etiquetasFieldItems); // 15 Etiquetas
  pt2 += pfSimple;  // 16 Sprint Creado
  pt2 += '</pivotFields>';
  pt2 += '<rowFields count="1"><field x="10"/></rowFields>';
  pt2 += rowItemsAsignado;
  pt2 += '<colFields count="1"><field x="12"/></colFields>';
  pt2 += colItemsEstado;
  pt2 += pageFields4;
  pt2 += dataFields2;
  pt2 += styleXml;
  pt2 += '</pivotTableDefinition>';

  // --- PT3: TablaEpica — Reporte por Épica (HU count + SP sum) ---
  const pageFields3 = '<pageFields count="3"><pageField fld="0" hier="-1"/><pageField fld="9" hier="-1"/><pageField fld="15" hier="-1"/></pageFields>';
  const dataFields3 = '<dataFields count="2"><dataField name="HU" fld="12" subtotal="count"/><dataField name="Puntos" fld="11" subtotal="sum"/></dataFields>';

  let pt3 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  pt3 += `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="TablaEpica" cacheId="0"${ptAttrs}>`;
  pt3 += '<location ref="A4:C50" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="2"/>';
  pt3 += '<pivotFields count="17">';
  pt3 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', tipoFieldItems);  // 0 Tipo
  pt3 += pfSimple;  // 1 HU Reportada
  pt3 += pfSimple;  // 2 Clave
  pt3 += pfSimple;  // 3 Resumen
  pt3 += pfSimple;  // 4 Subtareas
  pt3 += pfSimple;  // 5 Principal
  pt3 += pf(' axis="axisRow"', epicaFieldItems);                                  // 6 Épica
  pt3 += pfSimple;  // 7 Codigo HU
  pt3 += pfSimple;  // 8 Historia
  pt3 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', sprintFieldItems); // 9 Sprint
  pt3 += pfSimple;  // 10 Asignado
  pt3 += '<pivotField dataField="1" showAll="0"/>';                                 // 11 SP
  pt3 += '<pivotField dataField="1" showAll="0"/>';                                 // 12 Estado (count)
  pt3 += pfSimple;  // 13 Informador
  pt3 += pfSimple;  // 14 Creada
  pt3 += pf(' axis="axisPage" multipleItemSelectionAllowed="1"', etiquetasFieldItems); // 15 Etiquetas
  pt3 += pfSimple;  // 16 Sprint Creado
  pt3 += '</pivotFields>';
  pt3 += '<rowFields count="1"><field x="6"/></rowFields>';
  pt3 += rowItemsEpica;
  pt3 += '<colFields count="1"><field x="-2"/></colFields>';
  pt3 += '<colItems count="2"><i/><i><x v="1"/></i></colItems>';
  pt3 += pageFields3;
  pt3 += dataFields3;
  pt3 += styleXml;
  pt3 += '</pivotTableDefinition>';

  return { cacheDefXml: defXml, cacheRecXml: recXml, pt1Xml: pt1, pt2Xml: pt2, pt3Xml: pt3 };
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

  // fontId=3: blanca 11pt negrita
  // fontId=4: blanca 13pt negrita (para banners de título)
  // fontId=5: gris 11pt cursiva (para subtítulos)
  sty = sty.replace('<fonts count="3"', '<fonts count="6"');
  sty = sty.replace("</fonts>",
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
    '<font><b/><sz val="13"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' +
    '<font><i/><sz val="11"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font></fonts>'
  );

  // fillId=3: azul corporativo (4472C4)
  // fillId=4: naranja/ámbar (C65911)
  sty = sty.replace('<fills count="3"', '<fills count="5"');
  sty = sty.replace("</fills>",
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC65911"/><bgColor indexed="64"/></patternFill></fill></fills>'
  );

  // borderId=1: borde delgado
  sty = sty.replace('<borders count="1"', '<borders count="2"');
  sty = sty.replace("</borders>",
    "<border>" +
    '<left style="thin"><color indexed="64"/></left>' +
    '<right style="thin"><color indexed="64"/></right>' +
    '<top style="thin"><color indexed="64"/></top>' +
    '<bottom style="thin"><color indexed="64"/></bottom>' +
    "<diagonal/></border></borders>");

  // xfId=6: encabezado tabla (azul + blanco + centrado + borde)
  // xfId=7: Banner Titulo Sprint Actual (fontId=4, fillId=3 - azul, alineado izq, centrado vert)
  // xfId=8: Banner Titulo Deuda Técnica (fontId=4, fillId=4 - naranja, alineado izq, centrado vert)
  // xfId=9: Subtitulo Deuda Técnica (fontId=5, fillId=0, alineado izq, centrado vert)
  // xfId=10: Encabezado HU Reportada (fontId=3, fillId=4 - naranja + blanco + centrado + borde)
  sty = sty.replace('<cellXfs count="6"', '<cellXfs count="11"');
  sty = sty.replace("</cellXfs>",
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
    '<alignment horizontal="center" vertical="center" wrapText="1"/>' +
    '</xf>' +
    '<xf numFmtId="0" fontId="4" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">' +
    '<alignment horizontal="left" vertical="center"/>' +
    '</xf>' +
    '<xf numFmtId="0" fontId="4" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1">' +
    '<alignment horizontal="left" vertical="center"/>' +
    '</xf>' +
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1">' +
    '<alignment horizontal="left" vertical="center"/>' +
    '</xf>' +
    '<xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' +
    '<alignment horizontal="center" vertical="center" wrapText="1"/>' +
    '</xf></cellXfs>'
  );

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
    const [equipoRes, personsRes, huReportadasRes, exclusionsRes] = await Promise.all([
      supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
      supabase.from("jira_persons").select("email, display_name"),
      supabase.from("hu_reportadas").select("story_key"),
      supabase.from("deuda_tecnica_exclusions").select("story_key"),
    ]);

    if (equipoRes.error) console.error("[exportExcel] Error equipo:", equipoRes.error);
    if (personsRes.error) console.error("[exportExcel] Error persons:", personsRes.error);
    if (huReportadasRes.error) console.error("[exportExcel] Error huReportadas:", huReportadasRes.error);
    if (exclusionsRes?.error) console.error("[exportExcel] Error exclusions:", exclusionsRes.error);

    const reportedKeys = new Set((huReportadasRes.data || []).map((r) => r.story_key));
    const exclusionsSet = new Set((exclusionsRes?.data || []).map((r) => r.story_key));

    let allTickets = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, created_sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, comentario, priority, labels")
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

    // ─── Determinar sprints ─────────────────────────────────────────
    const extractSprintNum = (s) => parseInt(s.match(/(\d+)\s*$/)?.[1] || "0");
    const sortByNumDesc = (a, b) => extractSprintNum(b) - extractSprintNum(a);

    const pf3Tickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3-"));
    const pf3Sprints = [...new Set(pf3Tickets.map((t) => t.sprint).filter(Boolean))].sort(sortByNumDesc);
    const sprintParaPF3 = selectedSprint || pf3Sprints[0] || "";

    const pf3qaTickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3QA-"));
    const qaSprints = [...new Set(pf3qaTickets.map((t) => t.sprint).filter(Boolean))].sort(sortByNumDesc);
    const sprintParaQA = qaSprints[0] || "";

    console.log(`[exportExcel] Sprint PF3: "${sprintParaPF3}", Sprint QA: "${sprintParaQA}"`);

    // ─── Hoja "Osi" (sheet2) — TODOS los tickets (con filtro pre-aplicado) ─────
    const isStory = (type) => (type || "").toLowerCase().includes("histori") || (type || "").toLowerCase() === "story";
    const selectedSprintList = sprintParaPF3 ? sprintParaPF3.split(",").map((s) => s.trim()) : [];

    const headersOsi = [
      "Tipo", "HU Reportada", "Clave", "Resumen", "Subtareas", "Principal",
      "Épica", "Codigo HU", "Historia", "Sprint", "Persona asignada", "Story Points",
      "Estado", "Informador", "Creada", "Etiquetas", "Sprint Creado",
    ];

    const rowsOsi = allTickets.map((t) => {
      // Determinar si la fila debe ocultarse por defecto en el AutoFilter de Excel:
      // 1. Tipo: ocultar si no es Historia
      // 2. Etiquetas: ocultar si contiene "No_Reportar"
      // 3. Sprint: ocultar si no pertenece al sprint seleccionado
      const isHidden = !isStory(t.issue_type) ||
        (Array.isArray(t.labels) && t.labels.includes("No_Reportar")) ||
        (selectedSprintList.length > 0 && !selectedSprintList.includes(t.sprint));

      return {
        _hidden: isHidden,
        Tipo: t.issue_type || "",
        "HU Reportada": reportedKeys.has(t.jira_key) ? "Sí" : "No",
        Clave: t.jira_key || "",
        Resumen: t.summary || "",
        Subtareas: (subtaskMap[t.jira_key] || []).join(", "),
        Principal: t.parent_key || "",
        "Épica": resolveEpic(t)?.summary || "",
        "Codigo HU": resolveParentStory(t)?.jira_key || "",
        Historia: resolveParentStory(t)?.summary || "",
        Sprint: t.sprint || "",
        "Persona asignada": resolveName(t.assignee_email),
        "Story Points": t.story_points != null && t.story_points !== "" ? Number(t.story_points) : "",
        Estado: normalizeStatus(t.status),
        Informador: resolveName(t.reporter_email),
        Creada: t.created_at ? formatDate(t.created_at) : "",
        Etiquetas: Array.isArray(t.labels) ? t.labels.join(", ") : "",
        "Sprint Creado": t.created_sprint || t.sprint || "",
      };
    });

    // Construir XML de AutoFilter pre-seleccionado para Excel
    const storyTypesInCache = [...new Set(allTickets.map((t) => t.issue_type).filter(isStory))];
    const tipoFiltersXml = storyTypesInCache.length > 0
      ? `<filterColumn colId="0"><filters>${storyTypesInCache.map((st) => `<filter val="${escXml(st)}"/>`).join("")}</filters></filterColumn>`
      : "";
    const sprintFiltersXml = selectedSprintList.length > 0
      ? `<filterColumn colId="9"><filters>${selectedSprintList.map((s) => `<filter val="${escXml(s)}"/>`).join("")}</filters></filterColumn>`
      : "";
    const etiquetasFiltersXml = `<filterColumn colId="15"><customFilters><customFilter operator="notEqual" val="*No_Reportar*"/></customFilters></filterColumn>`;
    const osiAutoFilterXml = tipoFiltersXml + sprintFiltersXml + etiquetasFiltersXml;

    const osiXml = buildSheetXml(
      headersOsi,
      rowsOsi,
      [16, 15, 13, 52, 20, 13, 32, 13, 40, 22, 24, 13, 20, 24, 18, 20, 22],
      sst,
      "6",
      new Set([4, 7, 8]), // Ocultar columnas: Subtareas(4), Codigo HU(7), Historia(8)
      { "HU Reportada": "10" }, // Estilo naranja para HU Reportada
      osiAutoFilterXml
    );
    console.log(`[exportExcel] ✅ Hoja Osi: ${rowsOsi.length} filas totales (${rowsOsi.filter((r) => !r._hidden).length} visibles)`);

    // ─── Hoja "Datos QA" (sheet4) — TODOS los tickets PF3QA ────────
    const headersQA = ["Tipo", "Clave", "Resumen", "Sprint", "Persona asignada", "Estado", "Informador", "Etiquetas"];

    const rowsQA = pf3qaTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      Estado: normalizeStatus(t.status),
      Informador: resolveName(t.reporter_email),
      Etiquetas: Array.isArray(t.labels) ? t.labels.join(", ") : "",
    }));
    const qaXml = buildSheetXml(headersQA, rowsQA,
      [16, 13, 52, 22, 24, 20, 24, 20], sst);
    console.log(`[exportExcel] ✅ Hoja QA: ${rowsQA.length} filas (todos los PF3QA)`);

    /* ═══════════════════════════════════════════════════════════════
       5. CONSTRUIR PIVOT CACHES + PIVOT TABLES
       ═══════════════════════════════════════════════════════════════ */
    // PF3 (Osi) — cache 1, pivot tables 1-3
    const osiPivot = buildOsiCacheAndPivots(rowsOsi, sprintParaPF3, exclusionsSet);
    // QA — cache 2, pivot tables 4-5
    const qaPivot = buildQACacheAndPivots(rowsQA, sprintParaQA);

    /* ═══════════════════════════════════════════════════════════════
       6. INYECTAR TODO EN TEMPLATE
       ═══════════════════════════════════════════════════════════════ */
    // Hojas de datos
    zip.file("xl/worksheets/sheet2.xml", osiXml);
    zip.file("xl/worksheets/sheet4.xml", qaXml);
    zip.file("xl/sharedStrings.xml", sst.toXml());

    // Pivot cache y tables PF3 (cache 1)
    zip.file("xl/pivotCache/pivotCacheDefinition1.xml", osiPivot.cacheDefXml);
    zip.file("xl/pivotCache/pivotCacheRecords1.xml", osiPivot.cacheRecXml);
    zip.file("xl/pivotTables/pivotTable1.xml", osiPivot.pt1Xml);
    zip.file("xl/pivotTables/pivotTable2.xml", osiPivot.pt2Xml);
    zip.file("xl/pivotTables/pivotTable3.xml", osiPivot.pt3Xml);

    // Actualizar sheet1.xml (Reporte Sprint) para incluir las 2 tablas dinámicas del sprint actual
    let sheet1Xml = await zip.file("xl/worksheets/sheet1.xml").async("string");

    // Reemplazar la sección pivotTables para incluir únicamente las 2 tablas
    sheet1Xml = sheet1Xml.replace(
      /<pivotTables count="\d+">[\s\S]*?<\/pivotTables>/,
      '<pivotTables count="2"><pivotTable r:id="rId1"/><pivotTable r:id="rId2"/></pivotTables>'
    );

    // Inyectar el encabezado de título en sheetData de sheet1.xml
    const sprintTitleText = escXml(`  REPORTE - SPRINT: ${sprintParaPF3 || "Sprint Actual"}`);

    const newSheetData =
      '<sheetData>' +
      `<row r="1" ht="28" customHeight="1" spans="1:14" x14ac:dyDescent="0.25"><c r="A1" s="7" t="inlineStr"><is><t>${sprintTitleText}</t></is></c></row>` +
      '</sheetData>' +
      '<mergeCells count="1">' +
      '<mergeCell ref="A1:N1"/>' +
      '</mergeCells>';

    sheet1Xml = sheet1Xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, newSheetData);
    zip.file("xl/worksheets/sheet1.xml", sheet1Xml);

    // Actualizar xl/worksheets/_rels/sheet1.xml.rels para referenciar únicamente pivotTable1 y pivotTable2
    const sheet1RelsXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable2.xml"/>' +
      '</Relationships>';
    zip.file("xl/worksheets/_rels/sheet1.xml.rels", sheet1RelsXml);

    // Pivot cache y tables QA (cache 2)
    zip.file("xl/pivotCache/pivotCacheDefinition2.xml", qaPivot.cacheDefXml);
    zip.file("xl/pivotCache/pivotCacheRecords2.xml", qaPivot.cacheRecXml);
    zip.file("xl/pivotTables/pivotTable4.xml", qaPivot.pt4Xml);
    zip.file("xl/pivotTables/pivotTable5.xml", qaPivot.pt5Xml);

    console.log(`[exportExcel] ✅ Pivots inyectados: Osi (cache1 + PT1-3), QA (cache2 + PT4-5)`);

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
