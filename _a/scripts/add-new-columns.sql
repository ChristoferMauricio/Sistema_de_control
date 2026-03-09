-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN: Nuevos campos para jira_tickets
-- Ejecutar en: Supabase > SQL Editor (una sola vez)
-- ═══════════════════════════════════════════════════════════

-- Nuevas columnas
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS sprint TEXT;
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS story_points NUMERIC;
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS reporter_name TEXT;
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS reporter_email TEXT;
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS parent_key TEXT;
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS subtask_keys TEXT[];

-- Índices para las nuevas columnas
CREATE INDEX IF NOT EXISTS idx_jira_tickets_issue_type ON jira_tickets (issue_type);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_sprint ON jira_tickets (sprint);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_parent ON jira_tickets (parent_key);
