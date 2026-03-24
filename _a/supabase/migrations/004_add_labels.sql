-- Añadir columna labels (etiquetas de Jira) a jira_tickets
ALTER TABLE jira_tickets ADD COLUMN IF NOT EXISTS labels TEXT[];
