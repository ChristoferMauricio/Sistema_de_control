-- Migración: Agregar columna deleted_at para eliminación lógica de tickets
-- Ejecutar en el SQL Editor de Supabase ANTES de sincronizar

-- Agregar columna deleted_at (nullable, por defecto NULL = ticket activo)
ALTER TABLE jira_tickets
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Crear índice para filtrar rápidamente tickets activos (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_jira_tickets_deleted_at
ON jira_tickets (deleted_at)
WHERE deleted_at IS NULL;

-- Comentario descriptivo
COMMENT ON COLUMN jira_tickets.deleted_at IS 'Timestamp de eliminación lógica. NULL = ticket activo, NOT NULL = eliminado en Jira';
