/**
 * @file lib/exportDetailExcel.js
 * @description Generador premium de reportes en Excel para el módulo de Revisión de Detalle.
 *              Genera un Excel independiente con 2 hojas:
 *                1. "Reporte Detalle": Tabla Dinámica interactiva real (Persona asignada x Categoría).
 *                2. "Datos Detalle": Hoja con los datos planos e inyección de colores de categoría.
 *              Utiliza el template base reporte_template.xlsx y lo modifica con JSZip.
 */

import JSZip from "jszip";
import { CATEGORY_MAP } from "./classifyDetail";

const CATEGORY_ORDER = [
  "Sin detalle",
  "Detalle insuficiente",
  "Solo adjunto",
  "Detalle adecuado"
];

// Helper para escapar XML
function escXml(s) {
  return String(s || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Helper para obtener letra de columna Excel (0 -> A, 1 -> B...)
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
 * SharedStrings manager
 */
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

/**
 * Genera el XML de la hoja de datos Datos Detalle
 */
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

      let sAttr = "";
      if (h === "Categoría") {
        if (val === "Sin detalle") sAttr = ' s="7"';
        else if (val === "Detalle insuficiente") sAttr = ' s="8"';
        else if (val === "Solo adjunto") sAttr = ' s="9"';
        else if (val === "Detalle adecuado") sAttr = ' s="10"';
      }

      if (typeof val === "number") {
        xml += `<c r="${ref}"${sAttr}><v>${val}</v></c>`;
      } else {
        xml += `<c r="${ref}"${sAttr} t="s"><v>${sst.getIndex(String(val))}</v></c>`;
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
 * Reconstruye la pivot cache y la pivot table
 */
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

function buildDetailCacheAndPivot(rowsDetail, selectedSprint) {
  const sets = {
    sprint: new Set(),
    asignado: new Set(),
    etiqueta: new Set(),
  };
  const blanks = { sprint: false, asignado: false, etiqueta: false };

  rowsDetail.forEach((r) => {
    if (r.Sprint) sets.sprint.add(r.Sprint); else blanks.sprint = true;
    const a = r["Persona asignada"];
    if (a && a !== "—" && a !== "Sin asignar") sets.asignado.add(a); else blanks.asignado = true;
    const e = r.Etiquetas;
    if (e && e.trim()) sets.etiqueta.add(e); else blanks.etiqueta = true;
  });

  // Ordenar
  const sprintItems = [...sets.sprint].sort((a, b) => {
    const nA = parseInt(a.match(/(\d+)\s*$/)?.[1] || "0");
    const nB = parseInt(b.match(/(\d+)\s*$/)?.[1] || "0");
    return nA - nB;
  });
  const asignadoItems = [...sets.asignado].sort();
  const categoriaItems = CATEGORY_ORDER;
  const etiquetaItems = [...sets.etiqueta].sort();

  function makeSI(items, hasBlank, extra = "") {
    const count = items.length + (hasBlank ? 1 : 0);
    let x = `<sharedItems${hasBlank ? ' containsBlank="1"' : ""} count="${count}"${extra}>`;
    items.forEach((v) => { x += `<s v="${escXml(v)}"/>`; });
    if (hasBlank) x += "<m/>";
    x += "</sharedItems>";
    return { xml: x, items, hasBlank, blankIdx: hasBlank ? items.length : -1 };
  }

  const si = {
    sprint: makeSI(sprintItems, blanks.sprint),
    asignado: makeSI(asignadoItems, blanks.asignado),
    categoria: makeSI(categoriaItems, false),
    etiqueta: makeSI(etiquetaItems, blanks.etiqueta),
  };

  // 1. Pivot Cache Definition (10 campos)
  let defXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  defXml += '<pivotCacheDefinition refreshOnLoad="1" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  defXml += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  defXml += ` r:id="rId1" refreshedBy="Sistema" refreshedDate="46098"`;
  defXml += ` createdVersion="8" refreshedVersion="8" minRefreshableVersion="3"`;
  defXml += ` recordCount="${rowsDetail.length}">`;
  defXml += '<cacheSource type="worksheet"><worksheetSource ref="A1:J1048576" sheet="Datos Detalle"/></cacheSource>';
  defXml += '<cacheFields count="10">';
  defXml += '<cacheField name="Clave" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>';  // 0
  defXml += '<cacheField name="Resumen" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>'; // 1
  defXml += `<cacheField name="Sprint" numFmtId="0">${si.sprint.xml}</cacheField>`;                // 2
  defXml += `<cacheField name="Persona asignada" numFmtId="0">${si.asignado.xml}</cacheField>`;    // 3
  defXml += '<cacheField name="Estado" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 4
  defXml += `<cacheField name="Categoría" numFmtId="0">${si.categoria.xml}</cacheField>`;          // 5
  defXml += `<cacheField name="¿Tiene Épica?" numFmtId="0"><sharedItems count="2"><s v="Sí"/><s v="No"/></sharedItems></cacheField>`; // 6
  defXml += '<cacheField name="Épica" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>';  // 7
  defXml += `<cacheField name="Etiquetas" numFmtId="0">${si.etiqueta.xml}</cacheField>`;            // 8
  defXml += '<cacheField name="Detalle (Preview)" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>'; // 9
  defXml += '</cacheFields></pivotCacheDefinition>';

  // 2. Pivot Cache Records
  function getIdx(info, val, isBlank) {
    if (isBlank) return info.blankIdx;
    const idx = info.items.indexOf(val);
    return idx >= 0 ? idx : info.blankIdx;
  }

  let recXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  recXml += '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  recXml += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  recXml += ` count="${rowsDetail.length}">`;
  rowsDetail.forEach((r) => {
    recXml += "<r>";
    recXml += `<s v="${escXml(r.Clave)}"/>`;                           // 0 Clave
    recXml += `<s v="${escXml(r.Resumen)}"/>`;                         // 1 Resumen
    recXml += `<x v="${getIdx(si.sprint, r.Sprint, !r.Sprint)}"/>`;    // 2 Sprint
    const a = r["Persona asignada"];
    recXml += `<x v="${getIdx(si.asignado, a, !a || a === "—" || a === "Sin asignar")}"/>`; // 3 Persona asignada
    recXml += `<s v="${escXml(r.Estado)}"/>`;                           // 4 Estado
    recXml += `<x v="${getIdx(si.categoria, r["Categoría"], !r["Categoría"])}"/>`; // 5 Categoría
    recXml += `<x v="${r["¿Tiene Épica?"] === "Sí" ? 0 : 1}"/>`;        // 6 ¿Tiene Épica?
    recXml += `<s v="${escXml(r.Épica)}"/>`;                           // 7 Épica
    recXml += `<x v="${getIdx(si.etiqueta, r.Etiquetas, !r.Etiquetas || !r.Etiquetas.trim())}"/>`; // 8 Etiquetas
    recXml += `<s v="${escXml(r["Detalle (Preview)"])}"/>`;             // 9 Detalle
    recXml += "</r>";
  });
  recXml += "</pivotCacheRecords>";

  // 3. Pivot Table
  // Pre-filtrar sprint en la tabla dinámica si hay uno seleccionado
  const sprintHidden = new Set(selectedSprint ? sprintItems.filter((v) => v !== selectedSprint) : []);
  const sprintFieldItems = makeFieldItems(si.sprint, sprintHidden, false);
  const categoriaFieldItems = makeFieldItems(si.categoria, new Set(), true);
  const etiquetaFieldItems = makeFieldItems(si.etiqueta, new Set(), false);

  const visibleCategoria = categoriaItems;
  let rowItemsXml = `<rowItems count="${visibleCategoria.length + 1}">`;
  visibleCategoria.forEach((_, i) => { rowItemsXml += `<i><x v="${i}"/></i>`; });
  rowItemsXml += '<i t="grand"><x/></i></rowItems>';

  const ptAttrs =
    ' applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0"' +
    ' applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1"' +
    ' dataCaption="Valores" updatedVersion="8" minRefreshableVersion="3"' +
    ' useAutoFormatting="1" itemPrintTitles="1" createdVersion="8"' +
    ' indent="0" outline="1" outlineData="1" multipleFieldFilters="0"';
  const styleXml = '<pivotTableStyleInfo name="PivotStyleMedium4" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>';

  let pt1 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  pt1 += `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="TablaDinámica_Detalle" cacheId="0"${ptAttrs}>`;
  pt1 += '<location ref="A4:B9" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>';
  pt1 += '<pivotFields count="10">';
  pt1 += '<pivotField dataField="1" showAll="0"/>';                                                    // 0 Clave
  pt1 += '<pivotField showAll="0"/>';                                                                  // 1 Resumen
  pt1 += `<pivotField axis="axisPage" multipleItemSelectionAllowed="1" showAll="0">${sprintFieldItems}</pivotField>`; // 2 Sprint
  pt1 += '<pivotField showAll="0"/>';                                                                  // 3 Persona asignada
  pt1 += '<pivotField showAll="0"/>';                                                                  // 4 Estado
  pt1 += `<pivotField axis="axisRow" showAll="0">${categoriaFieldItems}</pivotField>`;                 // 5 Categoría
  pt1 += '<pivotField showAll="0"/>';                                                                  // 6 ¿Tiene Épica?
  pt1 += '<pivotField showAll="0"/>';                                                                  // 7 Épica
  pt1 += `<pivotField axis="axisPage" multipleItemSelectionAllowed="1" showAll="0">${etiquetaFieldItems}</pivotField>`; // 8 Etiquetas
  pt1 += '<pivotField showAll="0"/>';                                                                  // 9 Detalle
  pt1 += '</pivotFields>';
  pt1 += '<rowFields count="1"><field x="5"/></rowFields>';
  pt1 += rowItemsXml;
  pt1 += '<colItems count="1"><i><x/></i></colItems>';
  pt1 += '<pageFields count="2">';
  pt1 += '<pageField fld="2" hier="-1"/>';
  pt1 += '<pageField fld="8" hier="-1"/>';
  pt1 += '</pageFields>';
  pt1 += '<dataFields count="1"><dataField name="Cuenta de Clave" fld="0" subtotal="count" baseField="0" baseItem="0"/></dataFields>';
  pt1 += styleXml;
  pt1 += '</pivotTableDefinition>';

  return { cacheDefXml: defXml, cacheRecXml: recXml, pt1Xml: pt1 };
}

/**
 * Personaliza los estilos y renombra/reordena las hojas en el workbook
 */
async function customizeTemplate(zip) {
  // Renombrar y reordenar hojas para dejar solo "Reporte Detalle" (sheet1) y "Datos Detalle" (sheet2)
  let wbXml = await zip.file("xl/workbook.xml").async("string");
  wbXml = wbXml.replace(
    /<sheets>[\s\S]*?<\/sheets>/,
    "<sheets>" +
      '<sheet name="Reporte Detalle" sheetId="3" r:id="rId1"/>' +
      '<sheet name="Datos Detalle" sheetId="1" r:id="rId2"/>' +
    "</sheets>"
  );
  wbXml = wbXml.replace(/activeTab="\d+"/, 'activeTab="0"');
  // Mantener solo el primer pivot cache en workbook
  wbXml = wbXml.replace(
    /<pivotCaches>[\s\S]*?<\/pivotCaches>/,
    "<pivotCaches>" +
      '<pivotCache cacheId="0" r:id="rId3"/>' +
    "</pivotCaches>"
  );
  zip.file("xl/workbook.xml", wbXml);

  // Cargar y personalizar estilos a azul
  let sty = await zip.file("xl/styles.xml").async("string");

  // fontId=3: blanca, negrita. fonts 4,5,6,7 para categorías (pasteles legibles)
  sty = sty.replace('<fonts count="3"', '<fonts count="8"');
  sty = sty.replace("</fonts>",
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' + // index 3
    '<font><b/><sz val="10"/><color rgb="FF991B1B"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' + // index 4 (red text)
    '<font><b/><sz val="10"/><color rgb="FF92400E"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' + // index 5 (yellow text)
    '<font><b/><sz val="10"/><color rgb="FF9A3412"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' + // index 6 (orange text)
    '<font><b/><sz val="10"/><color rgb="FF065F46"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>' + // index 7 (green text)
    "</fonts>");

  // fillId=3: azul corporativo. fills 4,5,6,7 para celdas de categoría
  sty = sty.replace('<fills count="3"', '<fills count="8"');
  sty = sty.replace("</fills>",
    '<fill><patternFill patternType="solid"><fgColor rgb="FF4472C4"/><bgColor indexed="64"/></patternFill></fill>' + // index 3
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>' + // index 4 (red fill)
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFEF3C7"/><bgColor indexed="64"/></patternFill></fill>' + // index 5 (yellow fill)
    '<fill><patternFill patternType="solid"><fgColor rgb="FFFFEDD5"/><bgColor indexed="64"/></patternFill></fill>' + // index 6 (orange fill)
    '<fill><patternFill patternType="solid"><fgColor rgb="FFD1FAE5"/><bgColor indexed="64"/></patternFill></fill>' + // index 7 (green fill)
    "</fills>");

  // borderId=1: borde delgado
  sty = sty.replace('<borders count="1"', '<borders count="2"');
  sty = sty.replace("</borders>",
    "<border>" +
    '<left style="thin"><color indexed="64"/></left>' +
    '<right style="thin"><color indexed="64"/></right>' +
    '<top style="thin"><color indexed="64"/></top>' +
    '<bottom style="thin"><color indexed="64"/></bottom>' +
    "<diagonal/></border></borders>");

  // xfId=6: encabezado azul + blanco + centrado + borde. xf 7,8,9,10 para las celdas de categoría
  sty = sty.replace('<cellXfs count="6"', '<cellXfs count="11"');
  sty = sty.replace("</cellXfs>",
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + // index 6 (header)
    '<alignment horizontal="center" vertical="center" wrapText="1"/>' +
    "</xf>" +
    '<xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + // index 7 (red category)
    '<alignment horizontal="center" vertical="center"/>' +
    "</xf>" +
    '<xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + // index 8 (yellow category)
    '<alignment horizontal="center" vertical="center"/>' +
    "</xf>" +
    '<xf numFmtId="0" fontId="6" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + // index 9 (orange category)
    '<alignment horizontal="center" vertical="center"/>' +
    "</xf>" +
    '<xf numFmtId="0" fontId="7" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + // index 10 (green category)
    '<alignment horizontal="center" vertical="center"/>' +
    "</xf></cellXfs>");

  zip.file("xl/styles.xml", sty);
}

/**
 * Función principal para exportar el reporte de revisión de detalle con Tabla Dinámica real
 */
export async function exportDetailExcel(classifiedStories, selectedSprint) {
  try {
    console.log("[exportDetailExcel] ▶ Iniciando exportación de detalle...");

    // 1. Cargar el template original
    const templateRes = await fetch("/templates/reporte_template.xlsx?t=" + Date.now());
    if (!templateRes.ok) throw new Error(`Error al obtener template: ${templateRes.status}`);
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    // 2. Cargar shared strings
    const origSstXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (!origSstXml) throw new Error("sharedStrings.xml no encontrado");
    const sst = new SharedStrings(origSstXml);

    // 3. Preparar filas de Datos Detalle (8 columnas)
    const headers = [
      "Clave", "Resumen", "Sprint", "Persona asignada",
      "Estado", "Categoría", "¿Tiene Épica?", "Épica", "Etiquetas", "Detalle (Preview)"
    ];

    const rows = classifiedStories.map((s) => ({
      "Clave": s.jira_key || "",
      "Resumen": s.summary || "",
      "Sprint": s.sprint || "Backlog",
      "Persona asignada": s.assigneeName || "Sin asignar",
      "Estado": s.normalizedStatus || s.status || "",
      "Categoría": CATEGORY_MAP[s.category]?.label || s.category,
      "¿Tiene Épica?": s.parent_key ? "Sí" : "No",
      "Épica": s.parent_key || "—",
      "Etiquetas": Array.isArray(s.labels) ? s.labels.join(", ") : "",
      "Detalle (Preview)": s.preview || "—"
    }));

    // 4. Construir hoja Datos Detalle (sheet2.xml)
    // Column widths: Clave(14), Resumen(45), Sprint(22), Persona asignada(24), Estado(18), Categoría(22), Etiquetas(20), Detalle(50)
    const osiXml = buildSheetXml(headers, rows, [14, 45, 22, 24, 18, 22, 14, 16, 20, 50], sst);

    // 5. Construir Cache y Pivot Table
    const ptData = buildDetailCacheAndPivot(rows, selectedSprint);

    // 6. Inyectar archivos XML en el ZIP
    // Construir hoja Reporte Detalle (sheet1.xml) limpia para que Excel la dibuje dinámicamente sin celdas corruptas
    let sheet1Xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    sheet1Xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    sheet1Xml += '<dimension ref="A1:B9"/>';
    sheet1Xml += '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>';
    sheet1Xml += '<sheetFormatPr defaultRowHeight="15"/>';
    sheet1Xml += '<sheetData/>';
    sheet1Xml += '<pivotTables><pivotTable r:id="rId1"/></pivotTables>';
    sheet1Xml += '</worksheet>';

    zip.file("xl/worksheets/sheet1.xml", sheet1Xml);
    zip.file("xl/worksheets/sheet2.xml", osiXml);
    zip.file("xl/sharedStrings.xml", sst.toXml());

    // Inyectar Cache 1 y Pivot Table 1
    zip.file("xl/pivotCache/pivotCacheDefinition1.xml", ptData.cacheDefXml);
    zip.file("xl/pivotCache/pivotCacheRecords1.xml", ptData.cacheRecXml);
    zip.file("xl/pivotTables/pivotTable1.xml", ptData.pt1Xml);

    // 7. Modificar las relaciones de sheet1 para vincular UNICAMENTE a pivotTable1.xml
    const sheet1Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/>
</Relationships>`;
    zip.file("xl/worksheets/_rels/sheet1.xml.rels", sheet1Rels);

    // 8. Personalizar el workbook (nombres, estilos)
    await customizeTemplate(zip);

    // 9. Generar ZIP y descargar
    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    console.log(`[exportDetailExcel] ✅ Excel generado: ${blob.size} bytes`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toLocaleDateString("es-PE").replace(/\//g, "-");
    a.download = `Revision_HUs_${selectedSprint ? selectedSprint.replace(/\s+/g, "_") : "Todos"}_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("[exportDetailExcel] ✅ Descarga completada!");

  } catch (err) {
    console.error("Error al exportar reporte de detalle a Excel:", err);
    alert("Error al exportar a Excel. Revisa la consola para más detalles.");
  }
}

/**
 * Reconstruye la pivot cache y la pivot table para el reporte de Épicas
 */
function buildEpicCacheAndPivot(rows, selectedSprint) {
  const sets = {
    sprint: new Set(),
    asignado: new Set(),
    etiqueta: new Set(),
    epic: new Set(),
  };
  const blanks = { sprint: false, asignado: false, etiqueta: false, epic: false };

  rows.forEach((r) => {
    if (r.Sprint) sets.sprint.add(r.Sprint); else blanks.sprint = true;
    const a = r["Persona asignada"];
    if (a && a !== "—" && a !== "Sin asignar") sets.asignado.add(a); else blanks.asignado = true;
    const e = r.Etiquetas;
    if (e && e.trim()) sets.etiqueta.add(e); else blanks.etiqueta = true;
    const ep = r.Épica;
    if (ep && ep !== "—") sets.epic.add(ep); else blanks.epic = true;
  });

  const sprintItems = [...sets.sprint].sort();
  const asignadoItems = [...sets.asignado].sort();
  const epicItems = [...sets.epic].sort();
  const etiquetaItems = [...sets.etiqueta].sort();

  function makeSI(items, hasBlank, extra = "") {
    const count = items.length + (hasBlank ? 1 : 0);
    let x = `<sharedItems${hasBlank ? ' containsBlank="1"' : ""} count="${count}"${extra}>`;
    items.forEach((v) => { x += `<s v="${escXml(v)}"/>`; });
    if (hasBlank) x += "<m/>";
    x += "</sharedItems>";
    return { xml: x, items, hasBlank, blankIdx: hasBlank ? items.length : -1 };
  }

  const si = {
    sprint: makeSI(sprintItems, blanks.sprint),
    asignado: makeSI(asignadoItems, blanks.asignado),
    epic: makeSI(epicItems, blanks.epic),
    etiqueta: makeSI(etiquetaItems, blanks.etiqueta),
  };

  // 1. Pivot Cache Definition
  let defXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  defXml += '<pivotCacheDefinition refreshOnLoad="1" xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  defXml += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  defXml += ` r:id="rId1" refreshedBy="Sistema" refreshedDate="46098"`;
  defXml += ` createdVersion="8" refreshedVersion="8" minRefreshableVersion="3"`;
  defXml += ` recordCount="${rows.length}">`;
  defXml += '<cacheSource type="worksheet"><worksheetSource ref="A1:J1048576" sheet="Datos Detalle"/></cacheSource>';
  defXml += '<cacheFields count="10">';
  defXml += '<cacheField name="Clave" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>';  // 0
  defXml += '<cacheField name="Resumen" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>'; // 1
  defXml += `<cacheField name="Sprint" numFmtId="0">${si.sprint.xml}</cacheField>`;                // 2
  defXml += `<cacheField name="Persona asignada" numFmtId="0">${si.asignado.xml}</cacheField>`;    // 3
  defXml += '<cacheField name="Estado" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 4
  defXml += '<cacheField name="Categoría" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>'; // 5
  defXml += '<cacheField name="¿Tiene Épica?" numFmtId="0"><sharedItems count="2"><s v="Sí"/><s v="No"/></sharedItems></cacheField>'; // 6
  defXml += `<cacheField name="Épica" numFmtId="0">${si.epic.xml}</cacheField>`;                    // 7
  defXml += `<cacheField name="Etiquetas" numFmtId="0">${si.etiqueta.xml}</cacheField>`;            // 8
  defXml += '<cacheField name="Detalle (Preview)" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>'; // 9
  defXml += '</cacheFields></pivotCacheDefinition>';

  // 2. Records
  let recXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  recXml += '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  recXml += ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  recXml += ` count="${rows.length}">`;
  rows.forEach((r) => {
    recXml += "<r>";
    recXml += `<s v="${escXml(r.Clave)}"/>`;                           // 0 Clave
    recXml += `<s v="${escXml(r.Resumen)}"/>`;                         // 1 Resumen
    recXml += `<x v="${getIdx(si.sprint, r.Sprint, !r.Sprint)}"/>`;    // 2 Sprint
    const a = r["Persona asignada"];
    recXml += `<x v="${getIdx(si.asignado, a, !a || a === "—" || a === "Sin asignar")}"/>`; // 3 Persona asignada
    recXml += `<s v="${escXml(r.Estado)}"/>`;                           // 4 Estado
    recXml += `<s v="${escXml(r.Categoría)}"/>`;                         // 5 Categoría
    recXml += `<x v="${r["¿Tiene Épica?"] === "Sí" ? 0 : 1}"/>`;        // 6 ¿Tiene Épica?
    recXml += `<x v="${getIdx(si.epic, r.Épica, !r.Épica || r.Épica === "—")}"/>`; // 7 Épica
    recXml += `<x v="${getIdx(si.etiqueta, r.Etiquetas, !r.Etiquetas || !r.Etiquetas.trim())}"/>`; // 8 Etiquetas
    recXml += `<s v="${escXml(r["Detalle (Preview)"])}"/>`;             // 9 Detalle
    recXml += "</r>";
  });
  recXml += "</pivotCacheRecords>";

  // 3. Table
  const sprintHidden = new Set(selectedSprint ? sprintItems.filter((v) => v !== selectedSprint) : []);
  const sprintFieldItems = makeFieldItems(si.sprint, sprintHidden, false);
  const epicFieldItems = makeFieldItems(si.epic, new Set(), true);
  const etiquetaFieldItems = makeFieldItems(si.etiqueta, new Set(), false);

  const visibleEpic = epicItems;
  let rowItemsXml = `<rowItems count="${visibleEpic.length + 1}">`;
  visibleEpic.forEach((_, i) => { rowItemsXml += `<i><x v="${i}"/></i>`; });
  rowItemsXml += '<i t="grand"><x/></i></rowItems>';

  const ptAttrs =
    ' applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0"' +
    ' applyPatternFormats="0" applyAlignmentFormats="0" applyWidthHeightFormats="1"' +
    ' dataCaption="Valores" updatedVersion="8" minRefreshableVersion="3"' +
    ' useAutoFormatting="1" itemPrintTitles="1" createdVersion="8"' +
    ' indent="0" outline="1" outlineData="1" multipleFieldFilters="0"';
  const styleXml = '<pivotTableStyleInfo name="PivotStyleMedium4" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>';

  let pt1 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  pt1 += `<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" name="TablaDinámica_Épicas" cacheId="0"${ptAttrs}>`;
  pt1 += '<location ref="A4:B9" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>';
  pt1 += '<pivotFields count="10">';
  pt1 += '<pivotField dataField="1" showAll="0"/>';                                                    // 0 Clave
  pt1 += '<pivotField showAll="0"/>';                                                                  // 1 Resumen
  pt1 += `<pivotField axis="axisPage" multipleItemSelectionAllowed="1" showAll="0">${sprintFieldItems}</pivotField>`; // 2 Sprint
  pt1 += '<pivotField showAll="0"/>';                                                                  // 3 Persona asignada
  pt1 += '<pivotField showAll="0"/>';                                                                  // 4 Estado
  pt1 += '<pivotField showAll="0"/>';                                                                  // 5 Categoría
  pt1 += '<pivotField showAll="0"/>';                                                                  // 6 ¿Tiene Épica?
  pt1 += `<pivotField axis="axisRow" showAll="0">${epicFieldItems}</pivotField>`;                     // 7 Épica
  pt1 += `<pivotField axis="axisPage" multipleItemSelectionAllowed="1" showAll="0">${etiquetaFieldItems}</pivotField>`; // 8 Etiquetas
  pt1 += '<pivotField showAll="0"/>';                                                                  // 9 Detalle
  pt1 += '</pivotFields>';
  pt1 += '<rowFields count="1"><field x="7"/></rowFields>';
  pt1 += rowItemsXml;
  pt1 += '<colItems count="1"><i><x/></i></colItems>';
  pt1 += '<pageFields count="2">';
  pt1 += '<pageField fld="2" hier="-1"/>';
  pt1 += '<pageField fld="8" hier="-1"/>';
  pt1 += '</pageFields>';
  pt1 += '<dataFields count="1"><dataField name="Cuenta de Clave" fld="0" subtotal="count" baseField="0" baseItem="0"/></dataFields>';
  pt1 += styleXml;
  pt1 += '</pivotTableDefinition>';

  return { cacheDefXml: defXml, cacheRecXml: recXml, pt1Xml: pt1 };
}

/**
 * Función principal para exportar el reporte de Épicas con Tabla Dinámica real
 */
export async function exportEpicExcel(classifiedStories, selectedSprint) {
  try {
    console.log("[exportEpicExcel] ▶ Iniciando exportación de épicas...");

    const templateRes = await fetch("/templates/reporte_template.xlsx?t=" + Date.now());
    if (!templateRes.ok) throw new Error(`Error al obtener template: ${templateRes.status}`);
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    const origSstXml = await zip.file("xl/sharedStrings.xml")?.async("string");
    if (!origSstXml) throw new Error("sharedStrings.xml no encontrado");
    const sst = new SharedStrings(origSstXml);

    const headers = [
      "Clave", "Resumen", "Sprint", "Persona asignada",
      "Estado", "Categoría", "¿Tiene Épica?", "Épica", "Etiquetas", "Detalle (Preview)"
    ];

    const rows = classifiedStories.map((s) => ({
      "Clave": s.jira_key || "",
      "Resumen": s.summary || "",
      "Sprint": s.sprint || "Backlog",
      "Persona asignada": s.assigneeName || "Sin asignar",
      "Estado": s.normalizedStatus || s.status || "",
      "Categoría": CATEGORY_MAP[s.category]?.label || s.category,
      "¿Tiene Épica?": s.parent_key ? "Sí" : "No",
      "Épica": s.parent_key || "—",
      "Etiquetas": Array.isArray(s.labels) ? s.labels.join(", ") : "",
      "Detalle (Preview)": s.preview || "—"
    }));

    const osiXml = buildSheetXml(headers, rows, [14, 45, 22, 24, 18, 22, 14, 16, 20, 50], sst);

    const ptData = buildEpicCacheAndPivot(rows, selectedSprint);

    let sheet1Xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    sheet1Xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    sheet1Xml += '<dimension ref="A1:B9"/>';
    sheet1Xml += '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>';
    sheet1Xml += '<sheetFormatPr defaultRowHeight="15"/>';
    sheet1Xml += '<sheetData/>';
    sheet1Xml += '<pivotTables><pivotTable r:id="rId1"/></pivotTables>';
    sheet1Xml += '</worksheet>';

    zip.file("xl/worksheets/sheet1.xml", sheet1Xml);
    zip.file("xl/worksheets/sheet2.xml", osiXml);
    zip.file("xl/sharedStrings.xml", sst.toXml());

    zip.file("xl/pivotCache/pivotCacheDefinition1.xml", ptData.cacheDefXml);
    zip.file("xl/pivotCache/pivotCacheRecords1.xml", ptData.cacheRecXml);
    zip.file("xl/pivotTables/pivotTable1.xml", ptData.pt1Xml);

    const sheet1Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable1.xml"/>
</Relationships>`;
    zip.file("xl/worksheets/_rels/sheet1.xml.rels", sheet1Rels);

    await customizeTemplate(zip);

    const blob = await zip.generateAsync({
      type: "blob",
      compression: "DEFLATE",
      compressionOptions: { level: 6 }
    });

    console.log(`[exportEpicExcel] ✅ Excel generado: ${blob.size} bytes`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toLocaleDateString("es-PE").replace(/\//g, "-");
    a.download = `Reporte_Epicas_${selectedSprint ? selectedSprint.replace(/\s+/g, "_") : "Todos"}_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("[exportEpicExcel] ✅ Descarga completada!");

  } catch (err) {
    console.error("Error al exportar reporte de épicas a Excel:", err);
    alert("Error al exportar a Excel. Revisa la consola para más detalles.");
  }
}
