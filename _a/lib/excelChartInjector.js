/**
 * @file excelChartInjector.js
 * @description Inyecta una Tabla Dinámica (PivotTable) real de Excel y un gráfico de barras
 *   horizontales nativo en un buffer .xlsx usando JSZip para manipular el OOXML interno.
 *
 *   Estructura OOXML inyectada:
 *   - xl/pivotCache/pivotCacheDefinition1.xml  (definición de campos y fuente de datos)
 *   - xl/pivotCache/pivotCacheRecords1.xml     (registros cacheados)
 *   - xl/pivotTables/pivotTable1.xml           (layout de la tabla dinámica)
 *   - xl/charts/chart1.xml                     (gráfico de barras horizontales)
 *   - xl/drawings/drawing1.xml                 (posicionamiento del gráfico)
 *   - Relaciones y Content Types necesarios
 */
import JSZip from "jszip";

/* ═══════════════════════════════════════════════════════════════════════════
   UTILIDADES
   ═══════════════════════════════════════════════════════════════════════════ */

/** Escapa caracteres XML especiales */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Devuelve letra de columna Excel para un índice 0-based (0→A, 25→Z, 26→AA) */
function colLetter(idx) {
  let s = "";
  idx++;
  while (idx > 0) { idx--; s = String.fromCharCode(65 + (idx % 26)) + s; idx = Math.floor(idx / 26); }
  return s;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PIVOT CACHE DEFINITION
   ═══════════════════════════════════════════════════════════════════════════ */
function buildPivotCacheDef(srcSheet, lastCol, lastRow, columns, sharedItems) {
  const ref = `A1:${colLetter(lastCol)}${lastRow}`;
  const fields = columns.map((name, i) => {
    const items = sharedItems[i];
    if (items && items.length > 0) {
      const entries = items.map(v => `<s v="${esc(v)}"/>`).join("");
      return `<cacheField name="${esc(name)}" numFmtId="0"><sharedItems count="${items.length}">${entries}</sharedItems></cacheField>`;
    }
    return `<cacheField name="${esc(name)}" numFmtId="0"><sharedItems containsSemiMixedTypes="0" containsString="1"/></cacheField>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  r:id="rId1" refreshOnLoad="1" refreshedBy="Sistema" refreshedVersion="8" recordCount="${lastRow - 1}">
  <cacheSource type="worksheet"><worksheetSource ref="${ref}" sheet="${esc(srcSheet)}"/></cacheSource>
  <cacheFields count="${columns.length}">${fields}</cacheFields>
</pivotCacheDefinition>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PIVOT CACHE RECORDS
   ═══════════════════════════════════════════════════════════════════════════ */
function buildPivotCacheRecords(rows, sharedItems) {
  const records = rows.map(row => {
    const cells = row.map((val, i) => {
      const items = sharedItems[i];
      if (items && items.length > 0) {
        const idx = items.indexOf(val);
        return `<x v="${idx >= 0 ? idx : 0}"/>`;
      }
      return `<s v="${esc(val)}"/>`;
    }).join("");
    return `<r>${cells}</r>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  count="${rows.length}">
${records}
</pivotCacheRecords>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PIVOT TABLE DEFINITION
   ═══════════════════════════════════════════════════════════════════════════ */
function buildPivotTableDef(columns, sharedItems, rowFieldIdx, dataFieldIdx, pageFieldIdx, summaryEntries) {
  const N = summaryEntries.length;
  // Layout: A1=page label, B1=page value, A3=header row, A4..A(3+N)=data, A(4+N)=total
  const lastPivotRow = 4 + N;
  const ref = `A3:B${lastPivotRow}`;

  // Build pivotFields: one per source column
  const pivotFields = columns.map((_, i) => {
    if (i === rowFieldIdx) {
      const items = (sharedItems[i] || []).map((_, x) => `<item x="${x}"/>`).join("");
      return `<pivotField axis="axisRow" showAll="0"><items count="${sharedItems[i].length + 1}">${items}<item t="default"/></items></pivotField>`;
    }
    if (i === pageFieldIdx) {
      const items = (sharedItems[i] || []).map((_, x) => `<item x="${x}"/>`).join("");
      return `<pivotField axis="axisPage" showAll="0"><items count="${sharedItems[i].length + 1}">${items}<item t="default"/></items></pivotField>`;
    }
    if (i === dataFieldIdx) {
      return `<pivotField dataField="1" showAll="0"/>`;
    }
    return `<pivotField showAll="0"/>`;
  }).join("");

  // Row items: one per unique etiqueta + grand total
  const rowItems = summaryEntries.map((_, idx) => `<i><x v="${idx}"/></i>`).join("");
  const rowItemsXml = `<rowItems count="${N + 1}">${rowItems}<i t="grand"><x/></i></rowItems>`;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  name="TablaDinamica1" cacheId="0" applyNumberFormats="0" applyBorderFormats="0"
  applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0"
  applyWidthHeightFormats="1" dataCaption="Valores" grandTotalCaption="Total general"
  updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1"
  itemPrintTitles="1" outline="1" outlineData="1" multipleFieldFilters="0">
  <location ref="${ref}" firstHeaderRow="1" firstDataRow="1" firstDataCol="1" rowPageCount="1" colPageCount="1"/>
  <pivotFields count="${columns.length}">${pivotFields}</pivotFields>
  <rowFields count="1"><field x="${rowFieldIdx}"/></rowFields>
  ${rowItemsXml}
  <colItems count="1"><i/></colItems>
  <pageFields count="1"><field x="${pageFieldIdx}" hier="-1"/></pageFields>
  <dataFields count="1">
    <dataField name="Cuenta de Clave" fld="${dataFieldIdx}" subtotal="count" baseField="0" baseItem="0"/>
  </dataFields>
  <pivotTableStyleInfo name="PivotStyleMedium9" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>
</pivotTableDefinition>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHART XML (barras horizontales)
   ═══════════════════════════════════════════════════════════════════════════ */
function buildChartXml(sheetName, firstDataRow, lastDataRow) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:chart>
  <c:autoTitleDeleted val="1"/>
  <c:plotArea>
    <c:layout/>
    <c:barChart>
      <c:barDir val="bar"/>
      <c:grouping val="clustered"/>
      <c:varyColors val="0"/>
      <c:ser>
        <c:idx val="0"/>
        <c:order val="0"/>
        <c:tx><c:strRef><c:f>${sheetName}!$B$3</c:f></c:strRef></c:tx>
        <c:spPr><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill><a:ln w="0"><a:noFill/></a:ln></c:spPr>
        <c:dLbls>
          <c:numFmt formatCode="General" sourceLinked="0"/>
          <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
          <c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"/></a:pPr><a:endParaRPr lang="es-PE"/></a:p></c:txPr>
          <c:dLblPos val="outEnd"/>
          <c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>
        </c:dLbls>
        <c:cat><c:strRef><c:f>${sheetName}!$A$${firstDataRow}:$A$${lastDataRow}</c:f></c:strRef></c:cat>
        <c:val><c:numRef><c:f>${sheetName}!$B$${firstDataRow}:$B$${lastDataRow}</c:f></c:numRef></c:val>
      </c:ser>
      <c:axId val="111111111"/><c:axId val="222222222"/>
    </c:barChart>
    <c:catAx>
      <c:axId val="111111111"/>
      <c:scaling><c:orientation val="minMax"/></c:scaling>
      <c:delete val="0"/><c:axPos val="l"/>
      <c:title><c:tx><c:rich><a:bodyPr rot="-5400000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1" i="1"/></a:pPr><a:r><a:rPr lang="es-PE" sz="1000" b="1" i="1"/><a:t>Clasificaci&#243;n de Incidencias</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
      <c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:crossAx val="222222222"/>
    </c:catAx>
    <c:valAx>
      <c:axId val="222222222"/>
      <c:scaling><c:orientation val="minMax"/></c:scaling>
      <c:delete val="0"/><c:axPos val="b"/>
      <c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1" i="1"/></a:pPr><a:r><a:rPr lang="es-PE" sz="1000" b="1" i="1"/><a:t># de incidencias</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
      <c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:crossAx val="111111111"/>
    </c:valAx>
  </c:plotArea>
  <c:plotVisOnly val="1"/>
</c:chart>
</c:chartSpace>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DRAWING / RELATIONSHIPS BUILDERS
   ═══════════════════════════════════════════════════════════════════════════ */
function buildDrawingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/>
      </a:graphicData></a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

const RELS_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const REL_DRAWING = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const REL_CHART = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const REL_PIVOT_TABLE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable";
const REL_PIVOT_CACHE_DEF = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition";
const REL_PIVOT_CACHE_REC = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords";

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN EXPORT FUNCTION
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Inyecta una Tabla Dinámica real y un gráfico de barras horizontales en un xlsx.
 *
 * @param {ArrayBuffer} xlsxBuffer - Buffer del xlsx (solo con hoja "Incidencias" de datos)
 * @param {Object} opts
 * @param {string}   opts.srcSheetName   - Nombre de la hoja fuente de datos
 * @param {string}   opts.pvtSheetName   - Nombre de la hoja donde va la tabla dinámica
 * @param {number}   opts.pvtSheetIndex  - Índice 1-based de la hoja de la tabla dinámica
 * @param {string[]} opts.columns        - Nombres de columnas de la fuente de datos
 * @param {Array[]}  opts.dataRows       - Datos como array de arrays (sin header)
 * @param {number}   opts.rowFieldIdx    - Índice de la columna para filas (Etiqueta)
 * @param {number}   opts.dataFieldIdx   - Índice de la columna para conteo (Clave)
 * @param {number}   opts.pageFieldIdx   - Índice de la columna para filtro de página (Iteración)
 * @param {Array[]}  opts.summaryEntries - [["etiqueta", count], ...] pre-calculado, ordenado
 * @param {number}   opts.total          - Total general
 * @returns {Promise<Blob>}
 */
export async function injectPivotAndChart(xlsxBuffer, opts) {
  const {
    srcSheetName, pvtSheetName, pvtSheetIndex,
    columns, dataRows,
    rowFieldIdx, dataFieldIdx, pageFieldIdx,
    summaryEntries, total,
  } = opts;

  const N = summaryEntries.length;
  const numDataRows = dataRows.length;

  // Build shared items only for row and page fields
  const sharedItems = columns.map(() => null);
  [rowFieldIdx, pageFieldIdx].forEach(fi => {
    const unique = [...new Set(dataRows.map(r => r[fi]))].sort();
    sharedItems[fi] = unique;
  });

  const zip = await JSZip.loadAsync(xlsxBuffer);

  // ── 1. Pivot Cache ─────────────────────────────────────────────────────
  const lastCol = columns.length - 1;
  const lastRow = numDataRows + 1; // +1 for header

  zip.file("xl/pivotCache/pivotCacheDefinition1.xml",
    buildPivotCacheDef(srcSheetName, lastCol, lastRow, columns, sharedItems));
  zip.file("xl/pivotCache/pivotCacheRecords1.xml",
    buildPivotCacheRecords(dataRows, sharedItems));
  zip.file("xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${REL_PIVOT_CACHE_REC}" Target="pivotCacheRecords1.xml"/></Relationships>`);

  // ── 2. Pivot Table ─────────────────────────────────────────────────────
  zip.file("xl/pivotTables/pivotTable1.xml",
    buildPivotTableDef(columns, sharedItems, rowFieldIdx, dataFieldIdx, pageFieldIdx, summaryEntries));
  zip.file("xl/pivotTables/_rels/pivotTable1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${REL_PIVOT_CACHE_DEF}" Target="../pivotCache/pivotCacheDefinition1.xml"/></Relationships>`);

  // ── 3. Chart + Drawing ─────────────────────────────────────────────────
  const firstDataRow = 4;           // row 4 in Excel (1-indexed)
  const lastDataRowChart = 3 + N;   // last etiqueta data row
  zip.file("xl/charts/chart1.xml", buildChartXml(pvtSheetName, firstDataRow, lastDataRowChart));
  zip.file("xl/drawings/drawing1.xml", buildDrawingXml());
  zip.file("xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${REL_CHART}" Target="../charts/chart1.xml"/></Relationships>`);

  // ── 4. Sheet rels (pivot table + drawing) ──────────────────────────────
  zip.file(`xl/worksheets/_rels/sheet${pvtSheetIndex}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${RELS_NS}"><Relationship Id="rId1" Type="${REL_PIVOT_TABLE}" Target="../pivotTables/pivotTable1.xml"/><Relationship Id="rId2" Type="${REL_DRAWING}" Target="../drawings/drawing1.xml"/></Relationships>`);

  // ── 5. Modify sheet XML: add drawing reference ─────────────────────────
  const sheetPath = `xl/worksheets/sheet${pvtSheetIndex}.xml`;
  let sheetXml = await zip.file(sheetPath).async("string");
  if (!sheetXml.includes("<drawing")) {
    sheetXml = sheetXml.replace("</worksheet>", '<drawing r:id="rId2"/></worksheet>');
    zip.file(sheetPath, sheetXml);
  }

  // ── 6. Workbook: add pivotCaches ───────────────────────────────────────
  let wbXml = await zip.file("xl/workbook.xml").async("string");
  if (!wbXml.includes("pivotCaches")) {
    wbXml = wbXml.replace("</workbook>",
      '<pivotCaches><pivotCache cacheId="0" r:id="rIdPivotCache1"/></pivotCaches></workbook>');
    zip.file("xl/workbook.xml", wbXml);
  }

  // ── 7. Workbook rels: add pivot cache definition ───────────────────────
  let wbRels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  if (!wbRels.includes("pivotCacheDefinition")) {
    wbRels = wbRels.replace("</Relationships>",
      `<Relationship Id="rIdPivotCache1" Type="${REL_PIVOT_CACHE_DEF}" Target="pivotCache/pivotCacheDefinition1.xml"/></Relationships>`);
    zip.file("xl/_rels/workbook.xml.rels", wbRels);
  }

  // ── 8. Content Types ───────────────────────────────────────────────────
  let ct = await zip.file("[Content_Types].xml").async("string");
  const newTypes = [
    ["/xl/pivotCache/pivotCacheDefinition1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"],
    ["/xl/pivotCache/pivotCacheRecords1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"],
    ["/xl/pivotTables/pivotTable1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"],
    ["/xl/charts/chart1.xml", "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"],
    ["/xl/drawings/drawing1.xml", "application/vnd.openxmlformats-officedocument.drawing+xml"],
  ];
  newTypes.forEach(([part, type]) => {
    if (!ct.includes(part)) {
      ct = ct.replace("</Types>", `<Override PartName="${part}" ContentType="${type}"/></Types>`);
    }
  });
  zip.file("[Content_Types].xml", ct);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
