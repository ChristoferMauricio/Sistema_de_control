/**
 * ════════════════════════════════════════════════════════════════════════════
 * Archivo: lib/cronogramaData.js
 * Descripcion: Datos y funciones del cronograma de iteraciones del proyecto PGIM.
 *
 * Este modulo contiene:
 *   1. `cronogramaData`: Arreglo con todas las iteraciones del proyecto,
 *      incluyendo fechas de inicio, fin, duracion y plazos de presentacion.
 *   2. `getCurrentSprint()`: Determina la iteracion vigente segun la fecha actual.
 *   3. `formatCronogramaDate()`: Formatea fechas ISO a formato legible con
 *      dia de la semana en espanol.
 *
 * Estructura de cada entrada del cronograma:
 *   - no: Numero secuencial de la iteracion (0 = pre-operativa)
 *   - etapa: "Pre-Operativa" o "Etapa Operativa"
 *   - iteracion: Nombre de la iteracion (ej: "Iteracion F3.01")
 *   - duracion: Dias calendario de la iteracion
 *   - duracionAcumulada: Dias acumulados desde el inicio del proyecto
 *   - fechaInicio: Fecha de inicio (formato YYYY-MM-DD)
 *   - fechaFin: Fecha de fin de la iteracion (formato YYYY-MM-DD)
 *   - plazoPresentacion: Dias habiles para presentar entregables despues del fin
 *   - fechaMaxima: Fecha limite para presentacion de entregables (YYYY-MM-DD)
 * ════════════════════════════════════════════════════════════════════════════
 */

// ─── Datos del Cronograma ───────────────────────────────────────────────────

/**
 * Cronograma completo del proyecto PGIM Fase 3.
 * Contiene la etapa pre-operativa y las 18 iteraciones operativas (F3.01 a F3.18).
 * Cada iteracion tiene una duracion de 30 dias calendario, con 5 dias adicionales
 * de plazo para presentacion de entregables.
 *
 * @type {Array<{
 *   no: number,
 *   etapa: string,
 *   iteracion: string,
 *   duracion: number,
 *   duracionAcumulada: number,
 *   fechaInicio: string,
 *   fechaFin: string,
 *   plazoPresentacion: number|null,
 *   fechaMaxima: string|null
 * }>}
 */
export const cronogramaData = [
  { no: 0, etapa: "Pre-Operativa", iteracion: "Ninguna", duracion: 15, duracionAcumulada: 15, fechaInicio: "2025-03-18", fechaFin: "2025-04-01", plazoPresentacion: null, fechaMaxima: null },
  { no: 1, etapa: "Etapa Operativa", iteracion: "Iteración F3.01", duracion: 30, duracionAcumulada: 45, fechaInicio: "2025-04-02", fechaFin: "2025-05-01", plazoPresentacion: 5, fechaMaxima: "2025-05-06" },
  { no: 2, etapa: "Etapa Operativa", iteracion: "Iteración F3.02", duracion: 30, duracionAcumulada: 75, fechaInicio: "2025-05-02", fechaFin: "2025-05-31", plazoPresentacion: 5, fechaMaxima: "2025-06-05" },
  { no: 3, etapa: "Etapa Operativa", iteracion: "Iteración F3.03", duracion: 30, duracionAcumulada: 105, fechaInicio: "2025-06-01", fechaFin: "2025-06-30", plazoPresentacion: 5, fechaMaxima: "2025-07-05" },
  { no: 4, etapa: "Etapa Operativa", iteracion: "Iteración F3.04", duracion: 30, duracionAcumulada: 135, fechaInicio: "2025-07-01", fechaFin: "2025-07-30", plazoPresentacion: 5, fechaMaxima: "2025-08-04" },
  { no: 5, etapa: "Etapa Operativa", iteracion: "Iteración F3.05", duracion: 30, duracionAcumulada: 165, fechaInicio: "2025-07-31", fechaFin: "2025-08-29", plazoPresentacion: 5, fechaMaxima: "2025-09-03" },
  { no: 6, etapa: "Etapa Operativa", iteracion: "Iteración F3.06", duracion: 30, duracionAcumulada: 195, fechaInicio: "2025-08-30", fechaFin: "2025-09-28", plazoPresentacion: 5, fechaMaxima: "2025-10-03" },
  { no: 7, etapa: "Etapa Operativa", iteracion: "Iteración F3.07", duracion: 30, duracionAcumulada: 225, fechaInicio: "2025-09-29", fechaFin: "2025-10-28", plazoPresentacion: 5, fechaMaxima: "2025-11-02" },
  { no: 8, etapa: "Etapa Operativa", iteracion: "Iteración F3.08", duracion: 30, duracionAcumulada: 255, fechaInicio: "2025-10-29", fechaFin: "2025-11-27", plazoPresentacion: 5, fechaMaxima: "2025-12-02" },
  { no: 9, etapa: "Etapa Operativa", iteracion: "Iteración F3.09", duracion: 30, duracionAcumulada: 285, fechaInicio: "2025-11-28", fechaFin: "2025-12-27", plazoPresentacion: 5, fechaMaxima: "2026-01-01" },
  { no: 10, etapa: "Etapa Operativa", iteracion: "Iteración F3.10", duracion: 30, duracionAcumulada: 315, fechaInicio: "2025-12-28", fechaFin: "2026-01-26", plazoPresentacion: 5, fechaMaxima: "2026-01-31" },
  { no: 11, etapa: "Etapa Operativa", iteracion: "Iteración F3.11", duracion: 30, duracionAcumulada: 345, fechaInicio: "2026-01-27", fechaFin: "2026-02-25", plazoPresentacion: 5, fechaMaxima: "2026-03-02" },
  { no: 12, etapa: "Etapa Operativa", iteracion: "Iteración F3.12", duracion: 30, duracionAcumulada: 375, fechaInicio: "2026-02-26", fechaFin: "2026-03-27", plazoPresentacion: 5, fechaMaxima: "2026-04-01" },
  { no: 13, etapa: "Etapa Operativa", iteracion: "Iteración F3.13", duracion: 30, duracionAcumulada: 405, fechaInicio: "2026-03-28", fechaFin: "2026-04-26", plazoPresentacion: 5, fechaMaxima: "2026-05-01" },
  { no: 14, etapa: "Etapa Operativa", iteracion: "Iteración F3.14", duracion: 30, duracionAcumulada: 435, fechaInicio: "2026-04-27", fechaFin: "2026-05-26", plazoPresentacion: 5, fechaMaxima: "2026-05-31" },
  { no: 15, etapa: "Etapa Operativa", iteracion: "Iteración F3.15", duracion: 30, duracionAcumulada: 465, fechaInicio: "2026-05-27", fechaFin: "2026-06-25", plazoPresentacion: 5, fechaMaxima: "2026-06-30" },
  { no: 16, etapa: "Etapa Operativa", iteracion: "Iteración F3.16", duracion: 30, duracionAcumulada: 495, fechaInicio: "2026-06-26", fechaFin: "2026-07-25", plazoPresentacion: 5, fechaMaxima: "2026-07-30" },
  { no: 17, etapa: "Etapa Operativa", iteracion: "Iteración F3.17", duracion: 30, duracionAcumulada: 525, fechaInicio: "2026-07-26", fechaFin: "2026-08-24", plazoPresentacion: 5, fechaMaxima: "2026-08-29" },
  { no: 18, etapa: "Etapa Operativa", iteracion: "Iteración F3.18", duracion: 30, duracionAcumulada: 555, fechaInicio: "2026-08-25", fechaFin: "2026-09-23", plazoPresentacion: 5, fechaMaxima: "2026-09-28" },
];

// ─── Funciones del Cronograma ───────────────────────────────────────────────

/**
 * Determina la iteracion/sprint vigente segun una fecha dada.
 *
 * La logica recorre el cronograma y verifica si la fecha proporcionada
 * cae dentro del rango [fechaInicio, fechaMaxima] de alguna iteracion.
 * Si la iteracion no tiene fechaMaxima, se usa fechaFin + 5 dias como
 * fecha limite efectiva.
 *
 * Las fechas se parsean manualmente (split de "YYYY-MM-DD") en lugar de
 * usar `new Date("YYYY-MM-DD")` para evitar problemas de zona horaria
 * donde el constructor de Date interpreta la cadena como UTC.
 *
 * @param {Date} [today=new Date()] - Fecha a evaluar (por defecto, la fecha actual)
 * @returns {Object|null} El objeto de la iteracion vigente del cronograma, o null si
 *   ninguna iteracion coincide con la fecha proporcionada
 */
export function getCurrentSprint(today = new Date()) {
  // Resetear la hora a medianoche para comparaciones precisas solo por fecha
  const checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const row of cronogramaData) {
    // Saltar filas sin fechas definidas
    if (!row.fechaInicio || !row.fechaFin) continue;

    // Parsear la fecha de inicio separando "YYYY-MM-DD" manualmente
    // para evitar desfases de zona horaria del constructor de Date
    const [sy, sm, sd] = row.fechaInicio.split("-").map(Number);
    const startDate = new Date(sy, sm - 1, sd);

    // Determinar la fecha limite: usar fechaMaxima si existe,
    // de lo contrario usar fechaFin + 5 dias como margen
    let endDate;
    if (row.fechaMaxima) {
      const [ey, em, ed] = row.fechaMaxima.split("-").map(Number);
      endDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
    } else {
      const [ey, em, ed] = row.fechaFin.split("-").map(Number);
      endDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);
      endDate.setDate(endDate.getDate() + 5);
    }

    // Verificar si la fecha cae dentro del rango de esta iteracion
    if (checkDate >= startDate && checkDate <= endDate) {
      return row;
    }
  }

  // Ninguna iteracion coincide con la fecha proporcionada
  return null;
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) a un formato legible con dia de la semana
 * abreviado en espanol.
 *
 * Ejemplo: "2025-03-18" -> "mar. 18/03/2025"
 *
 * @param {string} isoDateString - Fecha en formato "YYYY-MM-DD"
 * @returns {string} Fecha formateada como "dia. DD/MM/YYYY", o cadena vacia si no hay fecha
 */
export function formatCronogramaDate(isoDateString) {
  if (!isoDateString) return "";

  // Nombres abreviados de los dias de la semana en espanol
  const days = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."];

  // Parsear manualmente para evitar desfases de zona horaria
  const [y, m, d] = isoDateString.split("-").map(Number);
  const date = new Date(y, m - 1, d);

  // Obtener el nombre del dia y formatear con ceros a la izquierda
  const dayName = days[date.getDay()];
  const paddedDay = String(d).padStart(2, "0");
  const paddedMonth = String(m).padStart(2, "0");

  return `${dayName} ${paddedDay}/${paddedMonth}/${y}`;
}
