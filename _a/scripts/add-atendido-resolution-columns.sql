-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN: Módulo Incidencias — fecha de resolución de Jira
-- Ejecutar en: Supabase > SQL Editor (una sola vez)
--
-- Nota: la clasificación "Atendido por" (Equipo Desarrollador PGIM / Externo)
-- NO requiere columna: se deriva automáticamente del título ("Externo |") o
-- de las etiquetas de Jira ("No_Reportar").
-- ═══════════════════════════════════════════════════════════

-- Fecha real en la que el ticket pasó a estado Finalizada, según el campo
-- "resolutiondate" de Jira. La llena automáticamente la sincronización.
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS resolution_date timestamp with time zone;
