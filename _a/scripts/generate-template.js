/**
 * Script para generar el template Excel con tablas dinámicas para QA.
 * Modifica el template existente para agregar:
 *   - Hoja "Datos QA" (fuente de datos para pivots QA)
 *   - Hoja "Reporte QA" (2 tablas dinámicas: por Informador y por Asignado)
 *   - pivotCacheDefinition2 + pivotCacheRecords2
 *   - pivotTable4 (por Informador) + pivotTable5 (por Asignado)
 *
 * Ejecutar una sola vez:  node scripts/generate-template.js
 */
const JSZip = require("jszip");
const fs = require("fs");

async function generateTemplate() {
  const buf = fs.readFileSync("public/templates/reporte_template.xlsx");
  const zip = await JSZip.loadAsync(buf);

  /* ═══ 1. Sheet4: "Datos QA" ═══ */
  zip.file(
    "xl/worksheets/sheet4.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      "<sheetData><row r=\"1\">" +
      '<c r="A1" t="inlineStr"><is><t>Tipo</t></is></c>' +
      '<c r="B1" t="inlineStr"><is><t>Clave</t></is></c>' +
      '<c r="C1" t="inlineStr"><is><t>Resumen</t></is></c>' +
      '<c r="D1" t="inlineStr"><is><t>Sprint</t></is></c>' +
      '<c r="E1" t="inlineStr"><is><t>Persona asignada</t></is></c>' +
      '<c r="F1" t="inlineStr"><is><t>Estado</t></is></c>' +
      '<c r="G1" t="inlineStr"><is><t>Informador</t></is></c>' +
      "</row></sheetData></worksheet>"
  );

  /* ═══ 2. Sheet5: "Reporte QA" (vacía, pivots se renderizan aquí) ═══ */
  zip.file(
    "xl/worksheets/sheet5.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'
  );

  /* ═══ 3. pivotCacheDefinition2 (lee de "Datos QA") ═══ */
  // Columnas: 0=Tipo, 1=Clave, 2=Resumen, 3=Sprint, 4=Persona asignada, 5=Estado, 6=Informador
  zip.file(
    "xl/pivotCache/pivotCacheDefinition2.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotCacheDefinition refreshOnLoad="1" ' +
      'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'r:id="rId1" refreshedBy="Sistema" refreshedDate="46098" ' +
      'createdVersion="8" refreshedVersion="8" minRefreshableVersion="3" recordCount="0">' +
      '<cacheSource type="worksheet"><worksheetSource ref="A1:G1048576" sheet="Datos QA"/></cacheSource>' +
      '<cacheFields count="7">' +
      '<cacheField name="Tipo" numFmtId="0"><sharedItems containsBlank="1" count="3"><s v="Historia"/><s v="Error"/><m/></sharedItems></cacheField>' +
      '<cacheField name="Clave" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      '<cacheField name="Resumen" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>' +
      '<cacheField name="Sprint" numFmtId="0"><sharedItems containsBlank="1" count="3"><s v="Tablero Sprint 1"/><s v="Tablero Sprint 2"/><m/></sharedItems></cacheField>' +
      '<cacheField name="Persona asignada" numFmtId="0"><sharedItems containsBlank="1" count="1"><m/></sharedItems></cacheField>' +
      '<cacheField name="Estado" numFmtId="0"><sharedItems containsBlank="1" count="4"><s v="Por hacer"/><s v="En curso"/><s v="Finalizada"/><m/></sharedItems></cacheField>' +
      '<cacheField name="Informador" numFmtId="0"><sharedItems containsBlank="1" count="1"><m/></sharedItems></cacheField>' +
      "</cacheFields></pivotCacheDefinition>"
  );

  /* ═══ 4. pivotCacheRecords2 (vacío, Excel los reconstruye) ═══ */
  zip.file(
    "xl/pivotCache/pivotCacheRecords2.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0"/>'
  );

  /* ═══ 5. pivotTable4: por Informador (posición A4 en "Reporte QA") ═══ */
  // Campos: 0=Tipo(page), 1=Clave(data/count), 2=Resumen(-), 3=Sprint(page), 4=Asignado(-), 5=Estado(col), 6=Informador(row)
  zip.file(
    "xl/pivotTables/pivotTable4.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaQA_Informador" cacheId="1" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      '<location ref="A4:E6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>' +
      '<pivotFields count="7">' +
      '<pivotField axis="axisPage" showAll="0"><items count="4"><item x="0"/><item x="1"/><item x="2"/><item t="default"/></items></pivotField>' +
      '<pivotField dataField="1" showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField axis="axisPage" showAll="0"><items count="4"><item x="0"/><item x="1"/><item x="2"/><item t="default"/></items></pivotField>' +
      '<pivotField showAll="0"/>' +
      '<pivotField axis="axisCol" showAll="0"><items count="5"><item x="0"/><item x="1"/><item x="2"/><item x="3"/><item t="default"/></items></pivotField>' +
      '<pivotField axis="axisRow" showAll="0"><items count="2"><item x="0"/><item t="default"/></items></pivotField>' +
      "</pivotFields>" +
      '<rowFields count="1"><field x="6"/></rowFields>' +
      '<rowItems count="1"><i t="grand"><x/></i></rowItems>' +
      '<colFields count="1"><field x="5"/></colFields>' +
      '<colItems count="1"><i t="grand"><x/></i></colItems>' +
      '<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="3" hier="-1"/></pageFields>' +
      '<dataFields count="1"><dataField name="Cuenta de Clave" fld="1" subtotal="count" baseField="0" baseItem="0"/></dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium4" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      "</pivotTableDefinition>"
  );

  /* ═══ 6. pivotTable5: por Asignado (posición I4 en "Reporte QA") ═══ */
  // Campos: 0=Tipo(page), 1=Clave(data/count), 2=Resumen(-), 3=Sprint(page), 4=Asignado(row), 5=Estado(col), 6=Informador(-)
  zip.file(
    "xl/pivotTables/pivotTable5.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaQA_Asignado" cacheId="1" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      '<location ref="I4:M6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>' +
      '<pivotFields count="7">' +
      '<pivotField axis="axisPage" showAll="0"><items count="4"><item x="0"/><item x="1"/><item x="2"/><item t="default"/></items></pivotField>' +
      '<pivotField dataField="1" showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField axis="axisPage" showAll="0"><items count="4"><item x="0"/><item x="1"/><item x="2"/><item t="default"/></items></pivotField>' +
      '<pivotField axis="axisRow" showAll="0"><items count="2"><item x="0"/><item t="default"/></items></pivotField>' +
      '<pivotField axis="axisCol" showAll="0"><items count="5"><item x="0"/><item x="1"/><item x="2"/><item x="3"/><item t="default"/></items></pivotField>' +
      '<pivotField showAll="0"/>' +
      "</pivotFields>" +
      '<rowFields count="1"><field x="4"/></rowFields>' +
      '<rowItems count="1"><i t="grand"><x/></i></rowItems>' +
      '<colFields count="1"><field x="5"/></colFields>' +
      '<colItems count="1"><i t="grand"><x/></i></colItems>' +
      '<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="3" hier="-1"/></pageFields>' +
      '<dataFields count="1"><dataField name="Cuenta de Clave" fld="1" subtotal="count" baseField="0" baseItem="0"/></dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium4" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      "</pivotTableDefinition>"
  );

  /* ═══ 7. Archivos de relaciones nuevos ═══ */
  zip.file(
    "xl/pivotCache/_rels/pivotCacheDefinition2.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords" Target="pivotCacheRecords2.xml"/>' +
      "</Relationships>"
  );

  zip.file(
    "xl/worksheets/_rels/sheet5.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable4.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable" Target="../pivotTables/pivotTable5.xml"/>' +
      "</Relationships>"
  );

  zip.file(
    "xl/pivotTables/_rels/pivotTable4.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="../pivotCache/pivotCacheDefinition2.xml"/>' +
      "</Relationships>"
  );

  zip.file(
    "xl/pivotTables/_rels/pivotTable5.xml.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="../pivotCache/pivotCacheDefinition2.xml"/>' +
      "</Relationships>"
  );

  /* ═══ 8. Actualizar [Content_Types].xml ═══ */
  let ct = await zip.file("[Content_Types].xml").async("string");
  ct = ct.replace(
    "</Types>",
    '<Override PartName="/xl/worksheets/sheet4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/pivotCache/pivotCacheDefinition2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml"/>' +
      '<Override PartName="/xl/pivotCache/pivotCacheRecords2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml"/>' +
      '<Override PartName="/xl/pivotTables/pivotTable4.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/>' +
      '<Override PartName="/xl/pivotTables/pivotTable5.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml"/>' +
      "</Types>"
  );
  zip.file("[Content_Types].xml", ct);

  /* ═══ 9. Actualizar xl/workbook.xml ═══ */
  let wb = await zip.file("xl/workbook.xml").async("string");
  wb = wb.replace(
    "</sheets>",
    '<sheet name="Datos QA" sheetId="5" r:id="rId9"/>' +
      '<sheet name="Reporte QA" sheetId="6" r:id="rId10"/></sheets>'
  );
  wb = wb.replace(
    "</pivotCaches>",
    '<pivotCache cacheId="1" r:id="rId11"/></pivotCaches>'
  );
  zip.file("xl/workbook.xml", wb);

  /* ═══ 10. Actualizar xl/_rels/workbook.xml.rels ═══ */
  let wbRels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  wbRels = wbRels.replace(
    "</Relationships>",
    '<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet4.xml"/>' +
      '<Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet5.xml"/>' +
      '<Relationship Id="rId11" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition" Target="pivotCache/pivotCacheDefinition2.xml"/>' +
      "</Relationships>"
  );
  zip.file("xl/_rels/workbook.xml.rels", wbRels);

  /* ═══ GUARDAR ═══ */
  const out = await zip.generateAsync({ type: "nodebuffer" });
  fs.writeFileSync("public/templates/reporte_template.xlsx", out);

  console.log("✅ Template actualizado exitosamente!");
  const zip2 = await JSZip.loadAsync(out);
  const files = [];
  zip2.forEach((p) => files.push(p));
  console.log(`   ${files.length} archivos en template:`);
  files.sort().forEach((f) => console.log(`   ${f}`));
}

generateTemplate().catch(console.error);
