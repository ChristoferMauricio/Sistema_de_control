/**
 * ════════════════════════════════════════════════════════════════════════════
 * Archivo: lib/classifyDetail.js
 * Descripcion: Lógica de clasificación de la calidad del detalle (description)
 *              de las Historias de usuario de Jira.
 *
 * Clasifica cada Historia en 4 categorías:
 *   1. sin_detalle:           No tiene nada escrito (null, vacío, solo espacios)
 *   2. detalle_insuficiente:  Tiene texto pero < 10 palabras o < 50 caracteres
 *   3. solo_adjunto:          No tiene texto significativo, solo imágenes/archivos
 *   4. detalle_adecuado:      Tiene texto con >= 10 palabras y >= 50 caracteres
 *
 * La clasificación limpia el markup wiki de Jira antes de evaluar, para contar
 * solo el texto real del usuario.
 * ════════════════════════════════════════════════════════════════════════════
 */

// ─── Constantes de Categorías ───────────────────────────────────────────────

/**
 * Definición de las 4 categorías de calidad de detalle.
 * Cada categoría incluye su clave, etiqueta, descripción, colores para la UI,
 * y colores para el gráfico de dona.
 *
 * @type {Array<{
 *   key: string,
 *   label: string,
 *   description: string,
 *   color: string,
 *   bgColor: string,
 *   borderColor: string,
 *   dotColor: string,
 *   chartColor: string
 * }>}
 */
export const DETAIL_CATEGORIES = [
  {
    key: "sin_detalle",
    label: "Sin detalle",
    description: "No tiene nada escrito en la descripción",
    color: "text-red-700",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    dotColor: "bg-red-500",
    chartColor: "#ef4444",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
  },
  {
    key: "detalle_insuficiente",
    label: "Detalle insuficiente",
    description: "Tiene texto pero es menor a 10 palabras o 50 caracteres",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    dotColor: "bg-amber-500",
    chartColor: "#f59e0b",
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
  },
  {
    key: "solo_adjunto",
    label: "Solo adjunto",
    description: "No tiene texto, solo imágenes o archivos adjuntos",
    color: "text-orange-700",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    dotColor: "bg-orange-500",
    chartColor: "#f97316",
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
  },
  {
    key: "detalle_adecuado",
    label: "Detalle adecuado",
    description: "Tiene un buen detalle con suficiente texto descriptivo",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    dotColor: "bg-emerald-500",
    chartColor: "#10b981",
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
  },
];

/**
 * Mapa rápido de key → categoría para acceso O(1).
 * @type {Object<string, Object>}
 */
export const CATEGORY_MAP = Object.fromEntries(
  DETAIL_CATEGORIES.map((c) => [c.key, c])
);

// ─── Patrones de Detección ──────────────────────────────────────────────────

/**
 * Patrones regex para detectar adjuntos e imágenes en el markup wiki de Jira.
 * Incluye:
 *   - Imágenes inline:          !imagen.png|thumbnail!
 *   - Adjuntos con referencia:  [^archivo.pdf]
 *   - URLs de attachment Jira:  /secure/attachment/...
 *   - Extensiones comunes:      .pdf, .docx, .xlsx, .json, .png, .jpg, etc.
 */
const ATTACHMENT_PATTERNS = [
  /!\S+\.(png|jpg|jpeg|gif|bmp|svg|webp)(\|[^!]*)?\!/gi,   // !image.png! o !image.png|thumbnail!
  /\[\^[^\]]+\]/g,                                           // [^archivo.pdf]
  /\/secure\/attachment\/\S+/gi,                             // URLs de attachment de Jira
  /\bhttps?:\/\/\S+\.(png|jpg|jpeg|gif|pdf|docx?|xlsx?|pptx?|json|csv|zip)\b/gi, // URLs directas a archivos
];

/**
 * Extensiones de archivos que indican un adjunto embebido en la descripción.
 */
const FILE_EXTENSIONS = /\.(pdf|docx?|xlsx?|pptx?|json|csv|zip|rar|7z|png|jpg|jpeg|gif|bmp|svg|webp)\b/gi;

// ─── Funciones de Limpieza ──────────────────────────────────────────────────

/**
 * Recorre recursivamente un nodo de Atlassian Document Format (ADF) para
 * extraer todo su contenido de texto plano.
 *
 * @param {Object} node - Nodo de la estructura ADF
 * @returns {string} Texto plano extraído
 */
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
 * Intenta parsear la descripción como un documento JSON en formato ADF.
 * Si es un JSON válido que representa un documento de Jira Cloud,
 * extrae y retorna su contenido en texto plano.
 *
 * @param {string} description - Texto que podría ser un JSON de tipo ADF
 * @returns {string|null} Texto plano si es un ADF válido, de lo contrario null
 */
function extractTextFromAdf(description) {
  if (!description) return null;
  const trimmed = description.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const doc = JSON.parse(trimmed);
      if (doc && doc.type === "doc") {
        return extractTextFromNode(doc);
      }
    } catch (e) {
      // Ignorar error de parseo y continuar con flujo normal
    }
  }
  return null;
}

/**
 * Limpia el markup wiki de Jira o parsea la estructura ADF en JSON para obtener solo el texto plano.
 * Elimina:
 *   - Headings: h1. h2. h3. etc.
 *   - Formato: *bold*, _italic_, +underline+, -strikethrough-, {{monospace}}
 *   - Links: [texto|url] → texto
 *   - Listas: * - # al inicio de línea
 *   - Tablas: ||header|| |cell|
 *   - Bloques de código: {code}...{/code}, {noformat}...{/noformat}
 *   - Paneles: {panel}...{/panel}
 *   - Imágenes y adjuntos (se analizan por separado)
 *   - Caracteres de control y espacios múltiples
 *
 * @param {string} text - Texto con markup wiki de Jira o JSON en formato ADF
 * @returns {string} Texto plano limpio
 */
function stripJiraMarkup(text) {
  if (!text) return "";

  // Intentar extraer texto si es un documento ADF en formato JSON
  const adfText = extractTextFromAdf(text);
  if (adfText !== null) {
    return adfText.replace(/\s+/g, " ").trim();
  }

  let clean = text;

  // Eliminar bloques de código y noformat (pueden contener mucho texto no relevante)
  clean = clean.replace(/\{code[^}]*\}[\s\S]*?\{code\}/gi, " ");
  clean = clean.replace(/\{noformat\}[\s\S]*?\{noformat\}/gi, " ");
  clean = clean.replace(/\{panel[^}]*\}[\s\S]*?\{panel\}/gi, " ");
  clean = clean.replace(/\{quote\}[\s\S]*?\{quote\}/gi, " ");

  // Eliminar imágenes y adjuntos (se evalúan por separado)
  clean = clean.replace(/!\S+(\|[^!]*)?\!/g, " ");        // !image.png|opts!
  clean = clean.replace(/\[\^[^\]]+\]/g, " ");             // [^file.pdf]

  // Eliminar links preservando el texto visible: [texto|url] → texto
  clean = clean.replace(/\[([^\]|]+)\|[^\]]+\]/g, "$1");  // [texto|url]
  clean = clean.replace(/\[([^\]]+)\]/g, "$1");            // [url] → url

  // Eliminar headings: h1. h2. h3. etc.
  clean = clean.replace(/^h[1-6]\.\s*/gm, "");

  // Eliminar formato inline
  clean = clean.replace(/\{\{([^}]+)\}\}/g, "$1");  // {{monospace}}
  clean = clean.replace(/\*([^*]+)\*/g, "$1");       // *bold*
  clean = clean.replace(/_([^_]+)_/g, "$1");          // _italic_
  clean = clean.replace(/\+([^+]+)\+/g, "$1");       // +underline+
  clean = clean.replace(/-([^-]+)-/g, "$1");          // -strikethrough-
  clean = clean.replace(/~([^~]+)~/g, "$1");          // ~subscript~
  clean = clean.replace(/\^([^^]+)\^/g, "$1");        // ^superscript^

  // Eliminar marcadores de lista
  clean = clean.replace(/^[\s]*[*#\-]+\s*/gm, " ");

  // Eliminar separadores de tabla
  clean = clean.replace(/\|\|/g, " ");
  clean = clean.replace(/\|/g, " ");

  // Eliminar macros restantes: {color}...{color}, {anchor:...}, etc.
  clean = clean.replace(/\{[^}]+\}/g, " ");

  // Limpiar caracteres de control y espacios múltiples
  clean = clean.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  clean = clean.replace(/\s+/g, " ").trim();

  return clean;
}

/**
 * Detecta si la descripción contiene referencias a adjuntos (imágenes o archivos).
 * Soporta tanto markup tradicional como nodos media/mediaSingle de ADF.
 *
 * @param {string} description - Texto de la descripción con markup o JSON
 * @returns {boolean} true si se detectan adjuntos
 */
function hasAttachments(description) {
  if (!description) return false;

  // Si es un documento ADF en formato JSON, buscar nodos de tipo media
  const trimmed = description.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const doc = JSON.parse(trimmed);
      let found = false;
      function walk(node) {
        if (!node || found) return;
        if (node.type === "media" || node.type === "mediaSingle" || node.type === "inlineCard" || node.type === "blockCard") {
          found = true;
          return;
        }
        if (Array.isArray(node.content)) {
          node.content.forEach(walk);
        }
      }
      walk(doc);
      if (found) return true;
    } catch (e) {
      // Ignorar error de parseo y continuar con expresiones regulares
    }
  }

  // Verificar cada patrón de adjunto tradicional
  for (const pattern of ATTACHMENT_PATTERNS) {
    pattern.lastIndex = 0; // Resetear regex stateful
    if (pattern.test(description)) return true;
  }

  // Verificar extensiones de archivo mencionadas en el texto
  FILE_EXTENSIONS.lastIndex = 0;
  if (FILE_EXTENSIONS.test(description)) return true;

  return false;
}

// ─── Función Principal de Clasificación ─────────────────────────────────────

/**
 * Clasifica la descripción de una Historia en una de las 4 categorías
 * según la calidad de su detalle.
 *
 * Lógica de evaluación (en orden de prioridad):
 *   1. Si description es null/vacío/solo espacios → "sin_detalle"
 *   2. Si tiene adjuntos pero no tiene texto significativo → "solo_adjunto"
 *   3. Si tiene texto pero < 10 palabras o < 50 caracteres → "detalle_insuficiente"
 *   4. Si tiene texto con >= 10 palabras y >= 50 caracteres → "detalle_adecuado"
 *
 * @param {string|null} description - Campo description del ticket Jira (puede ser null)
 * @returns {string} Clave de la categoría: "sin_detalle" | "detalle_insuficiente" | "solo_adjunto" | "detalle_adecuado"
 */
export function classifyDescription(description) {
  // Categoría 1: Sin detalle — null, vacío, o solo espacios/markup vacío
  if (!description || description.trim() === "") {
    return "sin_detalle";
  }

  // Limpiar markup de Jira para obtener texto plano
  const plainText = stripJiraMarkup(description);
  const hasAttach = hasAttachments(description);

  // Verificar si el texto plano está vacío después de limpiar
  if (!plainText || plainText.trim() === "") {
    // Categoría 3: Solo tiene adjuntos/imágenes, sin texto
    if (hasAttach) {
      return "solo_adjunto";
    }
    // Si no hay nada después de limpiar markup, es sin detalle
    return "sin_detalle";
  }

  // Contar palabras y caracteres del texto limpio
  const charCount = plainText.length;
  const wordCount = plainText.split(/\s+/).filter((w) => w.length > 0).length;

  // Categoría 3: Tiene adjuntos pero el texto es mínimo (< 5 palabras)
  if (hasAttach && wordCount < 5) {
    return "solo_adjunto";
  }

  // Categoría 2: Detalle insuficiente — texto demasiado corto
  if (wordCount < 10 || charCount < 50) {
    return "detalle_insuficiente";
  }

  // Categoría 4: Detalle adecuado
  return "detalle_adecuado";
}

/**
 * Obtiene el texto plano limpio de una descripción de Jira.
 * Útil para mostrar una previsualización en la tabla.
 *
 * @param {string|null} description - Descripción con markup de Jira
 * @param {number} [maxLength=120] - Longitud máxima del texto truncado
 * @returns {string} Texto plano truncado
 */
export function getPlainPreview(description, maxLength = 120) {
  if (!description) return "—";
  const plain = stripJiraMarkup(description);
  if (!plain) return "—";
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength) + "…";
}
