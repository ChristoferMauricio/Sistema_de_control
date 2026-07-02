/**
 * @file excelImageInjector.js
 * @description Incrusta imágenes dentro de celdas de un xlsx vía JSZip/OOXML
 *              (mismo enfoque que excelChartInjector.js, que inyecta gráficos).
 *              xlsx-js-style no soporta imágenes, por lo que se añaden las
 *              partes OOXML a mano: xl/media/*, xl/drawings/drawing1.xml,
 *              relaciones y content types.
 *
 * Uso: exportación del módulo "Correos pendientes" (la última imagen de cada
 *      recuadro se ancla a la celda de su fila).
 */
import JSZip from "jszip";

/** 1 píxel = 9525 EMU (English Metric Units, unidad de OOXML) */
const EMU_PER_PX = 9525;

const NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const T_IMG = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const T_DRW = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing";

/** Content types por extensión de imagen */
const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
};

/**
 * Construye el XML del drawing con un ancla (twoCellAnchor) por imagen.
 * Cada imagen se estira dentro de su celda (anchorCol, sheetRow) con un
 * pequeño margen interior (insetPx).
 */
function buildDrawingXml(images, { anchorCol, colWidthPx, rowHeightPx, insetPx }) {
  const inset = insetPx * EMU_PER_PX;
  const right = (colWidthPx - insetPx) * EMU_PER_PX;
  const bottom = (rowHeightPx - insetPx) * EMU_PER_PX;

  const anchors = images.map((img, i) => `
<xdr:twoCellAnchor editAs="oneCell">
<xdr:from><xdr:col>${anchorCol}</xdr:col><xdr:colOff>${inset}</xdr:colOff><xdr:row>${img.sheetRow}</xdr:row><xdr:rowOff>${inset}</xdr:rowOff></xdr:from>
<xdr:to><xdr:col>${anchorCol}</xdr:col><xdr:colOff>${right}</xdr:colOff><xdr:row>${img.sheetRow}</xdr:row><xdr:rowOff>${bottom}</xdr:rowOff></xdr:to>
<xdr:pic>
<xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Imagen ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>
<xdr:blipFill><a:blip r:embed="rIdImg${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>
<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr>
</xdr:pic>
<xdr:clientData/>
</xdr:twoCellAnchor>`).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}
</xdr:wsDr>`;
}

/**
 * Inyecta imágenes en las celdas de una hoja de un workbook xlsx ya generado.
 *
 * @param {ArrayBuffer|Uint8Array} xlsxBuf - Workbook generado por XLSX.write (type: "array")
 * @param {Object} opts
 * @param {number} opts.sheetIndex  - Índice de hoja 1-based (sheet1.xml, sheet2.xml, ...)
 * @param {number} opts.anchorCol   - Columna 0-based donde anclar las imágenes
 * @param {number} opts.colWidthPx  - Ancho en px de la columna de imagen (según !cols)
 * @param {number} opts.rowHeightPx - Alto en px de las filas con imagen (según !rows)
 * @param {number} [opts.insetPx=3] - Margen interior de la imagen dentro de la celda
 * @param {Array}  opts.images      - [{ sheetRow (0-based, ya incluye cabecera), bytes (ArrayBuffer), ext }]
 * @returns {Promise<Blob>} xlsx con las imágenes embebidas
 */
export async function injectImagesIntoSheet(xlsxBuf, opts) {
  const { sheetIndex, anchorCol, colWidthPx, rowHeightPx, insetPx = 3, images } = opts;
  const zip = await JSZip.loadAsync(xlsxBuf);

  // Sin imágenes: devolver el workbook tal cual
  if (!images || images.length === 0) {
    return zip.generateAsync({
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  /* ─── 1. Archivos de imagen en xl/media ─── */
  const mediaRels = images.map((img, i) => {
    const ext = MIME_BY_EXT[img.ext] ? img.ext : "png";
    const fileName = `imageCP${i + 1}.${ext}`;
    zip.file(`xl/media/${fileName}`, img.bytes);
    return { rId: `rIdImg${i + 1}`, fileName, ext };
  });

  /* ─── 2. Drawing + sus relaciones a las imágenes ─── */
  zip.file("xl/drawings/drawing1.xml", buildDrawingXml(images, { anchorCol, colWidthPx, rowHeightPx, insetPx }));
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_REL}">` +
      mediaRels.map((m) => `<Relationship Id="${m.rId}" Type="${T_IMG}" Target="../media/${m.fileName}"/>`).join("") +
      `</Relationships>`
  );

  /* ─── 3. Relación hoja → drawing (crear o fusionar sheetN.xml.rels) ─── */
  const relsPath = `xl/worksheets/_rels/sheet${sheetIndex}.xml.rels`;
  const drawingRel = `<Relationship Id="rIdDrawing1" Type="${T_DRW}" Target="../drawings/drawing1.xml"/>`;
  const relsFile = zip.file(relsPath);
  if (relsFile) {
    const existing = await relsFile.async("string");
    zip.file(relsPath, existing.replace("</Relationships>", `${drawingRel}</Relationships>`));
  } else {
    zip.file(relsPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS_REL}">${drawingRel}</Relationships>`);
  }

  /* ─── 4. Referencia al drawing dentro de la hoja ─── */
  const sheetPath = `xl/worksheets/sheet${sheetIndex}.xml`;
  let sheetXml = await zip.file(sheetPath).async("string");
  if (!sheetXml.includes("<drawing ")) {
    sheetXml = sheetXml.replace("</worksheet>", '<drawing r:id="rIdDrawing1"/></worksheet>');
    zip.file(sheetPath, sheetXml);
  }

  /* ─── 5. Content Types: extensiones de imagen + override del drawing ─── */
  let ct = await zip.file("[Content_Types].xml").async("string");
  const usedExts = [...new Set(mediaRels.map((m) => m.ext))];
  usedExts.forEach((ext) => {
    if (!new RegExp(`Extension="${ext}"`, "i").test(ct)) {
      ct = ct.replace("</Types>", `<Default Extension="${ext}" ContentType="${MIME_BY_EXT[ext]}"/></Types>`);
    }
  });
  if (!ct.includes("/xl/drawings/drawing1.xml")) {
    ct = ct.replace(
      "</Types>",
      `<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`
    );
  }
  zip.file("[Content_Types].xml", ct);

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
