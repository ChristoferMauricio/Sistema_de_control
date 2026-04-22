-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN: Nuevos campos para edición de fechas en incidencias
-- Ejecutar en: Supabase > SQL Editor (una sola vez)
-- ═══════════════════════════════════════════════════════════

-- Agregar columna para la Fecha de Inicio recibida
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS fecha_inicio DATE;

-- Agregar columna para la Fecha en la que se dio Solución
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS fecha_solucion DATE;
