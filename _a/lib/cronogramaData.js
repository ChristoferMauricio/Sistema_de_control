// lib/cronogramaData.js

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

/**
 * Returns the current sprint based on a given Date object.
 * Returns null if no sprint matches the exact date range.
 *
 * @param {Date} today The date to check (defaults to new Date())
 * @returns {Object|null} The matching sprint object from cronogramaData
 */
export function getCurrentSprint(today = new Date()) {
  // Reset time to start of day for accurate YYYY-MM-DD comparisons
  const checkDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  for (const row of cronogramaData) {
    if (!row.fechaInicio || !row.fechaFin) continue;
    
    // Parse strings into accurate local Date objects
    // Split "YYYY-MM-DD" directly to avoid timezone quirks
    const [sy, sm, sd] = row.fechaInicio.split("-").map(Number);
    const startDate = new Date(sy, sm - 1, sd);

    const [ey, em, ed] = row.fechaFin.split("-").map(Number);
    const endDate = new Date(ey, em - 1, ed, 23, 59, 59, 999);

    if (checkDate >= startDate && checkDate <= endDate) {
      return row;
    }
  }

  return null;
}

/**
 * Validates a formatted date string for display
 * Example: "mar. 18/03/2025"
 */
export function formatCronogramaDate(isoDateString) {
  if (!isoDateString) return "";
  const days = ["dom.", "lun.", "mar.", "mié.", "jue.", "vie.", "sáb."];
  const [y, m, d] = isoDateString.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  
  const dayName = days[date.getDay()];
  const paddedDay = String(d).padStart(2, "0");
  const paddedMonth = String(m).padStart(2, "0");
  
  return `${dayName} ${paddedDay}/${paddedMonth}/${y}`;
}
