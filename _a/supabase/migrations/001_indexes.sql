-- =============================================================================
-- Migración 001: Índices para optimizar consultas frecuentes
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- =============================================================================

-- ─── jira_tickets ─────────────────────────────────────────────────────────────

-- Filtro por tipo de incidencia (Historia, Bug, Subtarea, Épica, etc.)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_issue_type
  ON jira_tickets (issue_type);

-- Filtro por sprint (columna más filtrada en todas las vistas)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_sprint
  ON jira_tickets (sprint);

-- Filtro por asignado (usado en "Mis Pendientes" y DashboardNav)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_assignee_email
  ON jira_tickets (assignee_email);

-- Búsqueda de subtareas por padre (usado en incidencias y resolución de épicas)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_parent_key
  ON jira_tickets (parent_key);

-- Orden por fecha de actualización (order más común en todas las páginas)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_updated_at
  ON jira_tickets (updated_at DESC);

-- Filtro por clave de proyecto (jira_key LIKE 'PF3QA-%')
-- Un índice de texto en prefijo para búsquedas LIKE 'PREFIX%'
CREATE INDEX IF NOT EXISTS idx_jira_tickets_jira_key
  ON jira_tickets (jira_key text_pattern_ops);

-- Filtro por comentario no nulo (usado en la vista Observaciones)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_comentario_notnull
  ON jira_tickets (comentario)
  WHERE comentario IS NOT NULL AND comentario <> '';

-- ─── jira_ticket_status_history ──────────────────────────────────────────────

-- FK + filtro por ticket (consulta más frecuente: traer historial de N tickets)
CREATE INDEX IF NOT EXISTS idx_status_history_jira_key
  ON jira_ticket_status_history (jira_key);

-- Orden cronológico (siempre se ordena por changed_at ASC o DESC)
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at
  ON jira_ticket_status_history (changed_at DESC);

-- Índice compuesto para el badge de cambios en DashboardNav
-- (filtra por jira_key IN (...) AND changed_at > timestamp)
CREATE INDEX IF NOT EXISTS idx_status_history_key_date
  ON jira_ticket_status_history (jira_key, changed_at DESC);

-- ─── team_roles ──────────────────────────────────────────────────────────────

-- Lookup de rol por user_id (usado en layout.js al cargar sesión)
CREATE INDEX IF NOT EXISTS idx_team_roles_user_id
  ON team_roles (user_id);

-- Lookup de rol por email (fallback en layout.js)
CREATE INDEX IF NOT EXISTS idx_team_roles_email
  ON team_roles (email);

-- ─── Nombres ─────────────────────────────────────────────────────────────────

-- Lookup por nombre clave de Jira (resolveName usa LOWER comparison)
CREATE INDEX IF NOT EXISTS idx_nombres_programador
  ON "Nombres" (lower("Programador"));
