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
 * Devuelve clases de color según la prioridad de Jira
 * @param {string} priority - Prioridad del ticket
 * @returns {object} Clases CSS de bg y text
 */
export function getPriorityColor(priority) {
  const colors = {
    Highest: { bg: 'bg-red-500/20', text: 'text-red-400', dot: 'bg-red-500' },
    High: { bg: 'bg-orange-500/20', text: 'text-orange-400', dot: 'bg-orange-500' },
    Medium: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', dot: 'bg-yellow-500' },
    Low: { bg: 'bg-blue-500/20', text: 'text-blue-400', dot: 'bg-blue-500' },
    Lowest: { bg: 'bg-slate-500/20', text: 'text-slate-400', dot: 'bg-slate-500' },
  };
  return colors[priority] || colors.Medium;
}

/**
 * Devuelve clases de color según el estado del ticket
 * @param {string} status - Estado del ticket
 * @returns {object} Clases CSS
 */
export function getStatusColor(status) {
  const normalized = (status || '').toLowerCase();
  if (normalized.includes('done') || normalized.includes('cerrado'))
    return { bg: 'bg-emerald-500/20', text: 'text-emerald-400' };
  if (normalized.includes('progress') || normalized.includes('desarrollo'))
    return { bg: 'bg-blue-500/20', text: 'text-blue-400' };
  if (normalized.includes('review') || normalized.includes('certificación') || normalized.includes('certificacion'))
    return { bg: 'bg-purple-500/20', text: 'text-purple-400' };
  if (normalized.includes('producción') || normalized.includes('produccion'))
    return { bg: 'bg-red-500/20', text: 'text-red-400' };
  return { bg: 'bg-slate-500/20', text: 'text-slate-400' };
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
