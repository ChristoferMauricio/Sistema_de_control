/**
 * @file incidenciasFechas.js
 * @description Utilidades para extraer la "Fecha Inicio" de una incidencia desde el campo
 *   "description" del ticket Jira. Las descripciones contienen una línea tipo
 *   "Fecha: <fecha del correo>" cuyo formato varía según cómo se copió del correo original.
 *
 *   Formatos reales encontrados en la base de datos:
 *     - "Fecha: 2025-10-30"                              (ISO)
 *     - "Fecha: 2025-12-26 14:13"                        (ISO con hora)
 *     - "Fecha: 06/01/2026"                              (dd/mm/yyyy)
 *     - "fecha: 10-02-2025"                              (dd-mm-yyyy)
 *     - "fecha: viernes, 3 de octubre de 2025 14:37"     (largo con "de")
 *     - "fecha: jueves, 06 enero 2026 a las 18:34"       (largo sin "de")
 *     - "fecha: mar, 23 sept 2025 a las 18:32"           (mes abreviado)
 *     - "fecha: mié, 15 oct 2025, 16:29"
 *     - "fecha: mar, 17 mar, 13:45"                      (sin año → se infiere)
 *     - "fecha: jue, 26 mayo"                            (sin año ni hora)
 *     - "Fechas: 14 de noviembre de 2025"                (etiqueta en plural)
 */

/** Mapeo de nombres/abreviaturas de meses en español (sin acentos) a número de mes. */
const MESES = {
  ene: 1, enero: 1,
  feb: 2, febrero: 2,
  mar: 3, marzo: 3,
  abr: 4, abril: 4,
  may: 5, mayo: 5,
  jun: 6, junio: 6,
  jul: 7, julio: 7,
  ago: 8, agosto: 8,
  sep: 9, sept: 9, set: 9, septiembre: 9, setiembre: 9,
  oct: 10, octubre: 10,
  nov: 11, noviembre: 11,
  dic: 12, diciembre: 12,
};

/** Extrae recursivamente el texto plano de un nodo ADF (Atlassian Document Format). */
function extractTextFromNode(node) {
  if (!node) return "";
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }
  if (Array.isArray(node.content)) {
    return node.content.map(extractTextFromNode).join(" ");
  }
  return "";
}

/**
 * Si la descripción es un documento ADF en JSON, retorna su texto plano; si no, null.
 * @param {string} description - Campo description del ticket Jira
 * @returns {string|null}
 */
export function extractTextFromAdf(description) {
  if (!description) return null;
  const trimmed = description.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const doc = JSON.parse(trimmed);
      if (doc && doc.type === "doc") {
        return extractTextFromNode(doc);
      }
    } catch (e) {
      // No es JSON válido: tratar como texto plano
    }
  }
  return null;
}

/** Quita acentos y pasa a minúsculas para comparaciones tolerantes. */
function normalize(str) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Valida los componentes y construye la fecha en formato "yyyy-mm-dd". */
function buildIsoDate(year, month, day) {
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Interpreta el fragmento de texto que sigue a "Fecha:" y retorna la fecha en "yyyy-mm-dd".
 *
 * @param {string} segment - Texto posterior a "Fecha:" (ya recortado)
 * @param {string|Date|null} referenceDate - Fecha de referencia (creación del ticket) usada
 *   para inferir el año cuando el texto no lo incluye (ej: "mar, 17 mar, 13:45")
 * @returns {string|null} Fecha en formato "yyyy-mm-dd" o null si no se pudo interpretar
 */
function parseSegment(segment, referenceDate) {
  const text = normalize(segment);

  // 1. Formato ISO: 2025-10-30 (con o sin hora)
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return buildIsoDate(Number(m[1]), Number(m[2]), Number(m[3]));

  // 2. Formato numérico dd/mm/yyyy o dd-mm-yyyy
  m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return buildIsoDate(Number(m[3]), Number(m[2]), Number(m[1]));

  // 3. Día + mes en texto + año: "3 de octubre de 2025", "06 enero 2026", "23 sept 2025"
  const mesesPattern = Object.keys(MESES).sort((a, b) => b.length - a.length).join("|");
  m = text.match(new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?(${mesesPattern})\\b\\.?\\,?\\s+(?:de\\s+)?(\\d{4})`));
  if (m) return buildIsoDate(Number(m[3]), MESES[m[2]], Number(m[1]));

  // 4. Día + mes en texto SIN año: "17 mar", "26 mayo", "8 abr"
  //    El año se infiere de la fecha de referencia (creación del ticket): se asume el mismo
  //    año; si el resultado queda más de 60 días después de la referencia, se resta un año
  //    (caso de correos de diciembre reportados en tickets creados en enero).
  m = text.match(new RegExp(`(\\d{1,2})\\s+(?:de\\s+)?(${mesesPattern})\\b`));
  if (m && referenceDate) {
    const ref = new Date(referenceDate);
    if (!isNaN(ref.getTime())) {
      let year = ref.getFullYear();
      const candidate = new Date(year, MESES[m[2]] - 1, Number(m[1]));
      if (candidate.getTime() - ref.getTime() > 60 * 24 * 60 * 60 * 1000) year -= 1;
      return buildIsoDate(year, MESES[m[2]], Number(m[1]));
    }
  }

  return null;
}

/**
 * Extrae la "Fecha Inicio" de una incidencia desde su descripción de Jira.
 * Busca la etiqueta "Fecha:" (o "Fechas:") y parsea el texto que le sigue,
 * soportando los múltiples formatos con los que se registran las fechas de los correos.
 *
 * @param {string} description - Campo description del ticket Jira (texto plano o JSON ADF)
 * @param {string|Date|null} [referenceDate] - Fecha de creación del ticket, usada para
 *   inferir el año cuando la fecha del texto no lo incluye
 * @returns {string|null} Fecha en formato "yyyy-mm-dd" (compatible con <input type="date">)
 *   o null si la descripción no contiene una fecha reconocible
 */
export function parseFechaInicio(description, referenceDate = null) {
  if (!description) return null;

  const adfText = extractTextFromAdf(description);
  const textToSearch = adfText !== null ? adfText : description;

  const match = textToSearch.match(/fechas?\s*:\s*([^\n\r]+)/i);
  if (!match || !match[1]) return null;

  // Recortar el fragmento en el siguiente campo de la plantilla (el texto ADF se aplana
  // en una sola línea, por lo que "Correo:", "Solicitado por", etc. quedan a continuación)
  let segment = match[1];
  const cutMatch = segment.match(/^(.*?)\s*(correo:|solicitado\s|asunto:|usuario\s|reportante:|nota:)/i);
  if (cutMatch) segment = cutMatch[1];
  segment = segment.slice(0, 80);

  return parseSegment(segment, referenceDate);
}
