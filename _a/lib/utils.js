/**
 * Formatea una fecha ISO a formato legible en español
 * @param {string} dateString - Fecha en formato ISO
 * @returns {string} Fecha formateada
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
 * Formatea una fecha relativa (hace X minutos/horas/días)
 * @param {string} dateString - Fecha en formato ISO
 * @returns {string} Fecha relativa
 */
export function timeAgo(dateString) {
  if (!dateString) return '—';
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Justo ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;
  return formatDate(dateString);
}

/**
 * Trunca un string a la longitud especificada
 * @param {string} str - String a truncar
 * @param {number} maxLength - Longitud máxima
 * @returns {string} String truncado
 */
export function truncate(str, maxLength = 60) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '…';
}

/**
 * Devuelve clases de color según la prioridad de Jira (light theme)
 * @param {string} priority - Prioridad del ticket
 * @returns {object} Clases CSS de bg y text
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
 * Devuelve clases de color según el estado del ticket (light theme)
 * @param {string} status - Estado del ticket
 * @returns {object} Clases CSS
 */
export function getStatusColor(status) {
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
 * Devuelve clases de color según el tipo de incidencia (light theme)
 * @param {string} issueType - Tipo de incidencia
 * @returns {object} Clases CSS
 */
export function getIssueTypeStyle(issueType) {
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

/**
 * Genera iniciales a partir de un nombre
 * @param {string} name - Nombre completo
 * @returns {string} Iniciales (máx 2 caracteres)
 */
export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map(word => word[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Ordena sprints: Iteración F3.XX descendente (más reciente primero),
 * luego Tablero Sprint X ascendente, luego el resto alfabéticamente.
 */
export function sortSprints(sprints) {
  return [...sprints].sort((a, b) => {
    const iterA = a.match(/F3[,.](\d+)/i);
    const iterB = b.match(/F3[,.](\d+)/i);
    const tabA  = a.match(/Tablero\s+Sprint\s+(\d+)/i);
    const tabB  = b.match(/Tablero\s+Sprint\s+(\d+)/i);

    if (iterA && iterB) return parseInt(iterB[1]) - parseInt(iterA[1]);
    if (tabA  && tabB)  return parseInt(tabA[1])  - parseInt(tabB[1]);
    if (iterA) return -1;
    if (iterB) return  1;
    if (tabA)  return -1;
    if (tabB)  return  1;
    return a.localeCompare(b);
  });
}
