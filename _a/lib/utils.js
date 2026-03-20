/**
 * ════════════════════════════════════════════════════════════════════════════
 * Archivo: lib/utils.js
 * Descripcion: Funciones utilitarias compartidas para la aplicacion.
 *
 * Contiene helpers de:
 *   - Formateo de fechas (absoluto y relativo)
 *   - Truncado de cadenas de texto
 *   - Mapeo de colores CSS segun prioridad, estado y tipo de incidencia de Jira
 *   - Generacion de iniciales a partir de nombres
 *   - Ordenamiento personalizado de sprints
 *
 * Todas las funciones son puras (sin efectos secundarios) y se exportan
 * individualmente para ser importadas donde se necesiten.
 * ════════════════════════════════════════════════════════════════════════════
 */

// ─── Formateo de Fechas ─────────────────────────────────────────────────────

/**
 * Formatea una fecha ISO a formato legible en espanol (locale es-PE).
 * Ejemplo de salida: "20 mar. 2025, 14:30"
 *
 * @param {string} dateString - Fecha en formato ISO 8601 (ej: "2025-03-20T14:30:00Z")
 * @returns {string} Fecha formateada para mostrar en la UI, o '—' si no se proporciona fecha
 */
export function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Convierte una fecha ISO en una representacion relativa al momento actual.
 * Muestra "Justo ahora", "Hace X min", "Hace Xh", "Hace Xd" segun corresponda.
 * Si la diferencia supera 7 dias, delega a {@link formatDate} para mostrar la fecha completa.
 *
 * @param {string} dateString - Fecha en formato ISO 8601
 * @returns {string} Representacion relativa de la fecha, o '—' si no hay fecha
 */
export function timeAgo(dateString) {
  if (!dateString) return '—';
  const now = new Date();
  const date = new Date(dateString);

  // Calcular la diferencia en distintas unidades de tiempo
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);     // milisegundos a minutos
  const diffHours = Math.floor(diffMs / 3600000);   // milisegundos a horas
  const diffDays = Math.floor(diffMs / 86400000);   // milisegundos a dias

  // Seleccionar la unidad mas apropiada segun la magnitud de la diferencia
  if (diffMins < 1) return 'Justo ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return formatDate(dateString);
}

// ─── Manipulacion de Texto ──────────────────────────────────────────────────

/**
 * Trunca un string a la longitud maxima especificada, agregando puntos suspensivos
 * al final si el texto excede el limite.
 *
 * @param {string} str - Cadena de texto a truncar
 * @param {number} [maxLength=60] - Longitud maxima permitida (por defecto 60 caracteres)
 * @returns {string} Texto truncado con '...' si excede el limite, o cadena vacia si es null/undefined
 */
export function truncate(str, maxLength = 60) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '…';
}

// ─── Mapeo de Colores CSS (Tema Claro) ──────────────────────────────────────

/**
 * Devuelve las clases CSS de Tailwind correspondientes a una prioridad de Jira.
 * Utiliza tonos del tema claro (light theme) para fondo, texto e indicador de punto.
 *
 * Prioridades soportadas: Highest, High, Medium, Low, Lowest.
 * Si la prioridad no coincide con ninguna conocida, retorna los colores de "Medium".
 *
 * @param {string} priority - Nombre de la prioridad del ticket Jira (ej: "High", "Low")
 * @returns {{ bg: string, text: string, dot: string }} Objeto con clases CSS de Tailwind
 *   - bg: clase de color de fondo (ej: 'bg-red-50')
 *   - text: clase de color de texto (ej: 'text-red-700')
 *   - dot: clase de color del indicador circular (ej: 'bg-red-500')
 */
export function getPriorityColor(priority) {
  const colors = {
    Highest: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    High: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
    Medium: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    Low: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
    Lowest: { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  };
  return colors[priority] || colors.Medium;
}

/**
 * Devuelve las clases CSS de Tailwind segun el estado de un ticket Jira.
 * Realiza una busqueda por coincidencia parcial (case-insensitive) para soportar
 * tanto nombres en ingles como en espanol.
 *
 * Estados reconocidos:
 *   - Completado: "done", "cerrado" -> verde esmeralda
 *   - En progreso: "progress", "desarrollo" -> azul
 *   - En revision: "review", "certificacion" -> purpura
 *   - En produccion: "produccion" -> rojo
 *   - Otros: gris por defecto
 *
 * @param {string} status - Nombre del estado del ticket (ej: "In Progress", "En Desarrollo")
 * @returns {{ bg: string, text: string }} Objeto con clases CSS de fondo y texto
 */
export function getStatusColor(status) {
  // Normalizar a minusculas para comparacion flexible
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('done') || normalized.includes('cerrado'))
    return { bg: 'bg-emerald-50', text: 'text-emerald-700' };
  if (normalized.includes('progress') || normalized.includes('desarrollo'))
    return { bg: 'bg-blue-50', text: 'text-blue-700' };
  if (normalized.includes('review') || normalized.includes('certificación') || normalized.includes('certificacion'))
    return { bg: 'bg-purple-50', text: 'text-purple-700' };
  if (normalized.includes('producción') || normalized.includes('produccion'))
    return { bg: 'bg-red-50', text: 'text-red-700' };
  return { bg: 'bg-gray-100', text: 'text-gray-600' };
}

/**
 * Devuelve las clases CSS de Tailwind segun el tipo de incidencia (issue type) de Jira.
 * Soporta nombres en ingles y espanol mediante coincidencia parcial.
 *
 * Tipos reconocidos:
 *   - Historia (Story): verde
 *   - Bug: rojo
 *   - Sub-tarea (Sub-task / Subtask): teal
 *   - Tarea (Task): azul
 *   - Epica (Epic): purpura
 *   - Otros: gris por defecto
 *
 * @param {string} issueType - Tipo de incidencia (ej: "Story", "Bug", "Tarea")
 * @returns {{ bg: string, text: string, dot: string }} Objeto con clases CSS de Tailwind
 */
export function getIssueTypeStyle(issueType) {
  // Normalizar a minusculas para comparacion flexible bilingue
  const normalized = (issueType || '').toLowerCase();
  if (normalized.includes('histori') || normalized === 'story')
    return { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' };
  if (normalized.includes('bug'))
    return { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' };
  if (normalized.includes('sub-task') || normalized.includes('subtare') || normalized === 'subtask')
    return { bg: 'bg-teal-50', text: 'text-teal-700', dot: 'bg-teal-500' };
  if (normalized.includes('task') || normalized.includes('tarea'))
    return { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' };
  if (normalized.includes('epic') || normalized.includes('épica'))
    return { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' };
  return { bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
}

// ─── Generacion de Iniciales ────────────────────────────────────────────────

/**
 * Genera las iniciales de un nombre completo (maximo 2 caracteres).
 * Util para mostrar avatares con letras cuando no hay imagen de perfil.
 *
 * Ejemplo: "Juan Perez" -> "JP", "Ana" -> "A", null -> "?"
 *
 * @param {string} name - Nombre completo de la persona
 * @returns {string} Iniciales en mayusculas (maximo 2 letras), o '?' si no hay nombre
 */
export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')             // Separar por espacios
    .map(word => word[0])   // Tomar primera letra de cada palabra
    .slice(0, 2)            // Maximo 2 iniciales
    .join('')               // Unir en una sola cadena
    .toUpperCase();         // Convertir a mayusculas
}

// ─── Ordenamiento de Sprints ────────────────────────────────────────────────

/**
 * Ordena un arreglo de nombres de sprints con la siguiente logica de prioridad:
 *
 * 1. Sprints de tipo "Iteracion F3.XX": se ordenan de forma descendente
 *    (la iteracion mas reciente aparece primero).
 * 2. Sprints de tipo "Tablero Sprint X": se ordenan de forma ascendente.
 * 3. Cualquier otro sprint: se ordena alfabeticamente al final.
 *
 * Los sprints "Iteracion F3.XX" siempre aparecen antes que los de "Tablero Sprint",
 * y estos a su vez antes que cualquier otro nombre.
 *
 * @param {string[]} sprints - Arreglo de nombres de sprints a ordenar
 * @returns {string[]} Nuevo arreglo ordenado (no modifica el original)
 */
export function sortSprints(sprints) {
  return [...sprints].sort((a, b) => {
    // Extraer numeros de iteracion F3.XX y Tablero Sprint X mediante expresiones regulares
    const iterA = a.match(/F3[,.](\d+)/i);
    const iterB = b.match(/F3[,.](\d+)/i);
    const tabA  = a.match(/Tablero\s+Sprint\s+(\d+)/i);
    const tabB  = b.match(/Tablero\s+Sprint\s+(\d+)/i);

    // Si ambos son iteraciones F3, ordenar descendente (mayor numero primero)
    if (iterA && iterB) return parseInt(iterB[1]) - parseInt(iterA[1]);
    // Si ambos son Tablero Sprint, ordenar ascendente (menor numero primero)
    if (tabA  && tabB)  return parseInt(tabA[1])  - parseInt(tabB[1]);
    // Priorizar iteraciones F3 sobre todo lo demas
    if (iterA) return -1;
    if (iterB) return  1;
    // Priorizar Tablero Sprint sobre nombres genericos
    if (tabA)  return -1;
    if (tabB)  return  1;
    // Para el resto, ordenar alfabeticamente
    return a.localeCompare(b);
  });
}
