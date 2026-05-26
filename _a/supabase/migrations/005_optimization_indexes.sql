-- =============================================================================
-- MIGRACIÓN 005: Índices de Alto Rendimiento para el Gestor Jira
-- Ejecutar en: Supabase Dashboard → SQL Editor (una sola vez)
--
-- PROPÓSITO:
--   Optimiza de forma no destructiva las consultas más frecuentes realizadas por
--   el dashboard del Gestor Jira, reduciendo el uso de CPU a menos del 1% y
--   aligerando el almacenamiento de memoria caché en el plan gratuito de Supabase.
-- =============================================================================

-- ─── 1. OPTIMIZACIÓN DE FILTROS EN JIRA_TICKETS ──────────────────────────────

-- Acelera los filtros por sprint iterativo en Vista General, Reportes y HUs
CREATE INDEX IF NOT EXISTS idx_jira_tickets_sprint
  ON public.jira_tickets (sprint)
  WHERE (deleted_at IS NULL);

-- Optimiza la segmentación por tipo de ticket (Historia, Subtarea, Error)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_issue_type
  ON public.jira_tickets (issue_type)
  WHERE (deleted_at IS NULL);

-- Acelera las consultas por programador en "Mis Pendientes" y Sidebar
CREATE INDEX IF NOT EXISTS idx_jira_tickets_assignee_email
  ON public.jira_tickets (assignee_email)
  WHERE (deleted_at IS NULL);

-- Indexa las búsquedas de subtareas asociadas a su Historia padre (parent_key)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_parent_key
  ON public.jira_tickets (parent_key)
  WHERE (deleted_at IS NULL);

-- Optimiza el ordenamiento por fecha de actualización (el más común en la UI)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_updated_at
  ON public.jira_tickets (updated_at DESC)
  WHERE (deleted_at IS NULL);

-- Acelera las búsquedas parciales de proyectos Jira (LIKE 'PF3QA-%' o similares)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_jira_key_pattern
  ON public.jira_tickets (jira_key text_pattern_ops, updated_at DESC)
  WHERE (deleted_at IS NULL);

-- Índice parcial ligero para optimizar el indicador de comentarios en el Sidebar
CREATE INDEX IF NOT EXISTS idx_jira_tickets_comentario_notnull
  ON public.jira_tickets (jira_key)
  WHERE (deleted_at IS NULL AND comentario IS NOT NULL AND comentario <> '');


-- ─── 2. OPTIMIZACIÓN DE HISTORIAL DE ESTADOS Y GANTT ─────────────────────────

-- Acelera la obtención del historial cronológico de estados en los Reportes (badges de fechas)
CREATE INDEX IF NOT EXISTS idx_status_history_key_changed
  ON public.jira_ticket_status_history (jira_key, changed_at ASC);


-- ─── 3. OPTIMIZACIÓN DE SEGURIDAD Y RESOLUCIÓN DE NOMBRES ────────────────────

-- Acelera la verificación de roles de acceso del usuario logueado en team_roles
CREATE INDEX IF NOT EXISTS idx_team_roles_user_id 
  ON public.team_roles (user_id);

CREATE INDEX IF NOT EXISTS idx_team_roles_email 
  ON public.team_roles (email);

-- Acelera la conversión y normalización de nombres de programadores en minúsculas
CREATE INDEX IF NOT EXISTS idx_nombres_programador 
  ON public."Nombres" (lower("Programador"));
