/**
 * @file excelChartInjector.js
 * @description Inyecta PivotTable + gráfico de barras en un xlsx via JSZip/OOXML.
 */
import JSZip from "jszip";

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

function colLetter(i) {
  let s = ""; i++;
  while (i > 0) { i--; s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26); }
  return s;
}

/* ── Pivot Cache Definition ──────────────────────────────────────────── */
function buildCacheDef(srcSheet, cols, lastCol, numRecs, allShared) {
  const ref = `A1:${colLetter(lastCol)}${numRecs + 1}`;
  const fields = cols.map((name, i) => {
    const vals = allShared[i];
    const entries = vals.map(v => `<s v="${esc(v)}"/>`).join("");
    return `<cacheField name="${esc(name)}" numFmtId="0"><sharedItems count="${vals.length}">${entries}</sharedItems></cacheField>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 r:id="rId1" refreshOnLoad="1" refreshedVersion="6" recordCount="${numRecs}">
<cacheSource type="worksheet"><worksheetSource ref="${ref}" sheet="${esc(srcSheet)}"/></cacheSource>
<cacheFields count="${cols.length}">${fields}</cacheFields>
</pivotCacheDefinition>`;
}

/* ── Pivot Cache Records ─────────────────────────────────────────────── */
function buildCacheRecords(rows, allShared) {
  const recs = rows.map(row => {
    const cells = row.map((val, i) => {
      const idx = allShared[i].indexOf(String(val ?? ""));
      return `<x v="${idx >= 0 ? idx : 0}"/>`;
    }).join("");
    return `<r>${cells}</r>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" count="${rows.length}">
${recs}
</pivotCacheRecords>`;
}

/* ── Pivot Table Definition ──────────────────────────────────────────── */
function buildPivotTable(cols, allShared, rowIdx, dataIdx, pageIdx, summaryEntries) {
  const N = summaryEntries.length;
  const ref = `A3:B${N + 4}`;

  const pivotFields = cols.map((_, i) => {
    if (i === rowIdx) {
      const items = allShared[i].map((_, x) => `<item x="${x}"/>`).join("");
      return `<pivotField axis="axisRow" showAll="0"><items count="${allShared[i].length + 1}">${items}<item t="default"/></items></pivotField>`;
    }
    if (i === pageIdx) {
      const items = allShared[i].map((_, x) => `<item x="${x}"/>`).join("");
      return `<pivotField axis="axisPage" showAll="0"><items count="${allShared[i].length + 1}">${items}<item t="default"/></items></pivotField>`;
    }
    if (i === dataIdx) return `<pivotField dataField="1" showAll="0"/>`;
    return `<pivotField showAll="0"/>`;
  }).join("");

  const rowItems = summaryEntries.map((_, idx) => `<i><x v="${idx}"/></i>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
 name="TablaDinamica1" cacheId="1" applyNumberFormats="0" applyBorderFormats="0"
 applyFontFormats="0" applyPatternFormats="0" applyAlignmentFormats="0"
 applyWidthHeightFormats="1" dataCaption="Valores" grandTotalCaption="Total general"
 updatedVersion="6" minRefreshableVersion="3" useAutoFormatting="1"
 itemPrintTitles="1" outline="1" outlineData="1" multipleFieldFilters="0">
<location ref="${ref}" firstHeaderRow="1" firstDataRow="1" firstDataCol="1" rowPageCount="1" colPageCount="1"/>
<pivotFields count="${cols.length}">${pivotFields}</pivotFields>
<rowFields count="1"><field x="${rowIdx}"/></rowFields>
<rowItems count="${N + 1}">${rowItems}<i t="grand"><x/></i></rowItems>
<colItems count="1"><i/></colItems>
<pageFields count="1"><pageField fld="${pageIdx}" item="${allShared[pageIdx].length}" hier="-1"/></pageFields>
<dataFields count="1"><dataField name="Cuenta de Clave" fld="${dataIdx}" subtotal="count" baseField="0" baseItem="0"/></dataFields>
<pivotTableStyleInfo name="PivotStyleMedium9" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>
</pivotTableDefinition>`;
}

/* ── Chart XML ───────────────────────────────────────────────────────── */
function buildChart(sheet, firstRow, lastRow) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>
<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>
<c:ser><c:idx val="0"/><c:order val="0"/>
<c:tx><c:strRef><c:f>${sheet}!$B$3</c:f></c:strRef></c:tx>
<c:spPr><a:solidFill><a:srgbClr val="4472C4"/></a:solidFill><a:ln w="0"><a:noFill/></a:ln></c:spPr>
<c:dLbls><c:numFmt formatCode="General" sourceLinked="0"/>
<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"/></a:pPr><a:endParaRPr lang="es-PE"/></a:p></c:txPr>
<c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/>
<c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/>
</c:dLbls>
<c:cat><c:strRef><c:f>${sheet}!$A$${firstRow}:$A$${lastRow}</c:f></c:strRef></c:cat>
<c:val><c:numRef><c:f>${sheet}!$B$${firstRow}:$B$${lastRow}</c:f></c:numRef></c:val>
</c:ser><c:axId val="111"/><c:axId val="222"/></c:barChart>
<c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/>
<c:title><c:tx><c:rich><a:bodyPr rot="-5400000" vert="horz"/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1" i="1"/></a:pPr><a:r><a:rPr lang="es-PE" sz="1000" b="1" i="1"/><a:t>Clasificaci&#243;n de Incidencias</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:crossAx val="222"/></c:catAx>
<c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/>
<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1000" b="1" i="1"/></a:pPr><a:r><a:rPr lang="es-PE" sz="1000" b="1" i="1"/><a:t># de incidencias</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>
<c:numFmt formatCode="General" sourceLinked="1"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:crossAx val="111"/></c:valAx>
</c:plotArea><c:plotVisOnly val="1"/></c:chart></c:chartSpace>`;
}

/* ── Drawing ─────────────────────────────────────────────────────────── */
function buildDrawing() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<xdr:twoCellAnchor>
<xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="Chart 1"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>
<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/>
</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
}

/* ═══════════════════════════════════════════════════════════════════════
   MAIN EXPORT
   ═══════════════════════════════════════════════════════════════════════ */
const NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const T_DRW = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";
const T_CHR = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";
const T_PT  = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable";
const T_PCD = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition";
const T_PCR = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords";

export async function injectPivotAndChart(xlsxBuf, opts) {
  const { srcSheetName, pvtSheetName, pvtSheetIndex, columns, dataRows,
          rowFieldIdx, dataFieldIdx, pageFieldIdx, summaryEntries } = opts;

  const N = summaryEntries.length;
  const zip = await JSZip.loadAsync(xlsxBuf);

  // Build shared items for ALL fields (indexed references only)
  const allShared = columns.map((_, ci) => {
    const unique = [...new Set(dataRows.map(r => String(r[ci] ?? "")))];
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
  });

  // 1. Pivot Cache
  zip.file("xl/pivotCache/pivotCacheDefinition1.xml",
    buildCacheDef(srcSheetName, columns, columns.length - 1, dataRows.length, allShared));
  zip.file("xl/pivotCache/pivotCacheRecords1.xml",
    buildCacheRecords(dataRows, allShared));
  zip.file("xl/pivotCache/_rels/pivotCacheDefinition1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="${T_PCR}" Target="pivotCacheRecords1.xml"/></Relationships>`);

  // 2. Pivot Table
  zip.file("xl/pivotTables/pivotTable1.xml",
    buildPivotTable(columns, allShared, rowFieldIdx, dataFieldIdx, pageFieldIdx, summaryEntries));

  // 3. Chart + Drawing
  zip.file("xl/charts/chart1.xml", buildChart(pvtSheetName, 4, 3 + N));
  zip.file("xl/drawings/drawing1.xml", buildDrawing());
  zip.file("xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="${T_CHR}" Target="../charts/chart1.xml"/></Relationships>`);

  // 4. Sheet rels (pivotTable + drawing)
  zip.file(`xl/worksheets/_rels/sheet${pvtSheetIndex}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="${T_PT}" Target="../pivotTables/pivotTable1.xml"/><Relationship Id="rId2" Type="${T_DRW}" Target="../drawings/drawing1.xml"/></Relationships>`);

  // 5. Add drawing ref to sheet XML
  const sp = `xl/worksheets/sheet${pvtSheetIndex}.xml`;
  let sx = await zip.file(sp).async("string");
  if (!sx.includes("<drawing")) {
    sx = sx.replace("</worksheet>", '<drawing r:id="rId2"/></worksheet>');
    zip.file(sp, sx);
  }

  // 6. Workbook: add pivotCaches
  let wb = await zip.file("xl/workbook.xml").async("string");
  if (!wb.includes("pivotCaches")) {
    wb = wb.replace("</workbook>",
      '<pivotCaches><pivotCache cacheId="1" r:id="rIdPC1"/></pivotCaches></workbook>');
    zip.file("xl/workbook.xml", wb);
  }

  // 7. Workbook rels
  let wr = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  if (!wr.includes("pivotCache")) {
    wr = wr.replace("</Relationships>",
      `<Relationship Id="rIdPC1" Type="${T_PCD}" Target="pivotCache/pivotCacheDefinition1.xml"/></Relationships>`);
    zip.file("xl/_rels/workbook.xml.rels", wr);
  }

  // 8. Content Types
  let ct = await zip.file("[Content_Types].xml").async("string");
  [
    ["/xl/pivotCache/pivotCacheDefinition1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"],
    ["/xl/pivotCache/pivotCacheRecords1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"],
    ["/xl/pivotTables/pivotTable1.xml", "application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"],
    ["/xl/charts/chart1.xml", "application/vnd.openxmlformats-officedocument.drawingml.chart+xml"],
    ["/xl/drawings/drawing1.xml", "application/vnd.openxmlformats-officedocument.drawing+xml"],
  ].forEach(([p, t]) => {
    if (!ct.includes(p)) ct = ct.replace("</Types>", `<Override PartName="${p}" ContentType="${t}"/></Types>`);
  });
  zip.file("[Content_Types].xml", ct);

  return zip.generateAsync({ type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
