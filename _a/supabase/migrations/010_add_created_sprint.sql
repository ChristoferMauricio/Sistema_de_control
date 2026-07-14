-- 010_add_created_sprint.sql
-- Agrega la columna created_sprint a jira_tickets para registrar el primer sprint en el que fue asociada la historia

ALTER TABLE public.jira_tickets ADD COLUMN IF NOT EXISTS created_sprint TEXT;
