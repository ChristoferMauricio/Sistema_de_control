/**
 * @file excelChartInjector.js
 * @description Inyecta un gráfico de barras horizontales nativo de Excel en un buffer .xlsx
 *   usando JSZip para manipular la estructura OOXML interna del archivo.
 *
 *   Flujo:
 *   1. Recibe el buffer xlsx generado por xlsx-js-style
 *   2. Lo abre con JSZip
 *   3. Agrega: chart XML, drawing XML, relaciones y content types
 *   4. Modifica la hoja destino para vincular el drawing
 *   5. Retorna un Blob listo para descarga
 */
import JSZip from "jszip";

/**
 * Genera el XML del chart (gráfico de barras horizontales).
 * @param {string} sheetName - Nombre de la hoja con los datos resumen
 * @param {number} lastDataRow - Última fila de datos (1-indexed, sin contar header ni total)
 */
function buildChartXml(sheetName, lastDataRow) {
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
        <c:tx><c:strRef><c:f>${sheetName}!$B$1</c:f></c:strRef></c:tx>
        <c:spPr>
          <a:solidFill><a:srgbClr val="4472C4"/></a:solidFill>
          <a:ln w="0"><a:noFill/></a:ln>
        </c:spPr>
        <c:dLbls>
          <c:numFmt formatCode="General" sourceLinked="0"/>
          <c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>
          <c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900" b="1"/></a:pPr><a:endParaRPr lang="es-PE"/></a:p></c:txPr>
          <c:dLblPos val="outEnd"/>
          <c:showLegendKey val="0"/>
          <c:showVal val="1"/>
          <c:showCatName val="0"/>
          <c:showSerName val="0"/>
          <c:showPercent val="0"/>
          <c:showBubbleSize val="0"/>
        </c:dLbls>
        <c:cat><c:strRef><c:f>${sheetName}!$A$2:$A$${lastDataRow}</c:f></c:strRef></c:cat>
        <c:val><c:numRef><c:f>${sheetName}!$B$2:$B$${lastDataRow}</c:f></c:numRef></c:val>
      </c:ser>
      <c:axId val="111111111"/>
      <c:axId val="222222222"/>
    </c:barChart>
    <c:catAx>
      <c:axId val="111111111"/>
      <c:scaling><c:orientation val="minMax"/></c:scaling>
      <c:delete val="0"/>
      <c:axPos val="l"/>
      <c:title>
        <c:tx><c:rich>
          <a:bodyPr rot="-5400000" vert="horz"/>
          <a:lstStyle/>
          <a:p><a:pPr><a:defRPr sz="1000" b="1" i="1"/></a:pPr>
            <a:r><a:rPr lang="es-PE" sz="1000" b="1" i="1"/><a:t>Clasificaci&#243;n de Incidencias</a:t></a:r>
          </a:p>
        </c:rich></c:tx>
        <c:overlay val="0"/>
      </c:title>
      <c:numFmt formatCode="General" sourceLinked="1"/>
      <c:majorTickMark val="out"/>
      <c:minorTickMark val="none"/>
      <c:crossAx val="222222222"/>
    </c:catAx>
    <c:valAx>
      <c:axId val="222222222"/>
      <c:scaling><c:orientation val="minMax"/></c:scaling>
      <c:delete val="0"/>
      <c:axPos val="b"/>
      <c:title>
        <c:tx><c:rich>
          <a:bodyPr/>
          <a:lstStyle/>
          <a:p><a:pPr><a:defRPr sz="1000" b="1" i="1"/></a:pPr>
            <a:r><a:rPr lang="es-PE" sz="1000" b="1" i="1"/><a:t># de incidencias</a:t></a:r>
          </a:p>
        </c:rich></c:tx>
        <c:overlay val="0"/>
      </c:title>
      <c:numFmt formatCode="General" sourceLinked="1"/>
      <c:majorTickMark val="out"/>
      <c:minorTickMark val="none"/>
      <c:crossAx val="111111111"/>
    </c:valAx>
  </c:plotArea>
  <c:plotVisOnly val="1"/>
</c:chart>
</c:chartSpace>`;
}

/** XML del drawing que posiciona el chart en la hoja */
function buildDrawingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>14</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Chart 1"/>
        <xdr:cNvGraphicFramePr/>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

/** Relaciones del drawing → chart */
function buildDrawingRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
</Relationships>`;
}

/** Relaciones de la hoja → drawing */
function buildSheetRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`;
}

/**
 * Inyecta un gráfico de barras horizontales en un workbook xlsx.
 *
 * @param {ArrayBuffer} xlsxBuffer - Buffer del archivo xlsx generado por xlsx-js-style
 * @param {Object} opts
 * @param {string} opts.sheetName - Nombre de la hoja con datos resumen
 * @param {number} opts.sheetIndex - Índice (1-based) de la hoja resumen en el workbook
 * @param {number} opts.dataRows - Cantidad de filas de datos (sin header ni total)
 * @returns {Promise<Blob>} Blob del xlsx con el chart inyectado
 */
export async function injectBarChart(xlsxBuffer, { sheetName, sheetIndex, dataRows }) {
  const zip = await JSZip.loadAsync(xlsxBuffer);

  const lastDataRow = dataRows + 1; // +1 porque la fila 1 es header

  // 1. Agregar chart XML
  zip.file("xl/charts/chart1.xml", buildChartXml(sheetName, lastDataRow));

  // 2. Agregar drawing XML
  zip.file("xl/drawings/drawing1.xml", buildDrawingXml());

  // 3. Relaciones del drawing
  zip.file("xl/drawings/_rels/drawing1.xml.rels", buildDrawingRels());

  // 4. Relaciones de la hoja resumen
  zip.file(`xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`, buildSheetRels());

  // 5. Agregar referencia al drawing en la hoja resumen
  const sheetPath = `xl/worksheets/sheet${sheetIndex}.xml`;
  let sheetXml = await zip.file(sheetPath).async("string");
  // Insertar <drawing r:id="rId1"/> antes de </worksheet>
  if (!sheetXml.includes("<drawing")) {
    sheetXml = sheetXml.replace(
      "</worksheet>",
      '<drawing r:id="rId1"/></worksheet>'
    );
    zip.file(sheetPath, sheetXml);
  }

  // 6. Actualizar [Content_Types].xml
  let contentTypes = await zip.file("[Content_Types].xml").async("string");
  const chartType = '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>';
  const drawingType = '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>';
  if (!contentTypes.includes("chart1.xml")) {
    contentTypes = contentTypes.replace("</Types>", `${chartType}${drawingType}</Types>`);
    zip.file("[Content_Types].xml", contentTypes);
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
