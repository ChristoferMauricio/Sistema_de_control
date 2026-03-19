-- =============================================================================
-- Migración 002: FN1 — Eliminar arrays de jira_tickets
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- IMPORTANTE: ejecutar en el orden indicado (bloques separados por comentario)
-- =============================================================================

-- ─── PASO 1: Crear tablas relacionales ───────────────────────────────────────

-- Subtareas: reemplaza subtask_keys TEXT[]
CREATE TABLE IF NOT EXISTS jira_ticket_subtasks (
  parent_key  TEXT NOT NULL REFERENCES jira_tickets(jira_key) ON DELETE CASCADE,
  child_key   TEXT NOT NULL,
  PRIMARY KEY (parent_key, child_key)
);

CREATE INDEX IF NOT EXISTS idx_subtasks_parent ON jira_ticket_subtasks(parent_key);
CREATE INDEX IF NOT EXISTS idx_subtasks_child  ON jira_ticket_subtasks(child_key);

-- Links entre tickets: reemplaza linked_keys (columna que nunca existió → corrige pérdida de datos)
CREATE TABLE IF NOT EXISTS jira_ticket_links (
  source_key  TEXT NOT NULL REFERENCES jira_tickets(jira_key) ON DELETE CASCADE,
  target_key  TEXT NOT NULL,
  link_type   TEXT,   -- p.ej. "inwardIssue", "outwardIssue", "blocks", "is blocked by"
  PRIMARY KEY (source_key, target_key)
);

CREATE INDEX IF NOT EXISTS idx_links_source ON jira_ticket_links(source_key);
CREATE INDEX IF NOT EXISTS idx_links_target ON jira_ticket_links(target_key);

-- ─── PASO 2: Backfill de subtask_keys existentes ─────────────────────────────
-- (Si subtask_keys no existe aún como columna, este bloque no hará nada)

INSERT INTO jira_ticket_subtasks (parent_key, child_key)
SELECT jira_key, unnest(subtask_keys)
FROM   jira_tickets
WHERE  subtask_keys IS NOT NULL
  AND  array_length(subtask_keys, 1) > 0
ON CONFLICT DO NOTHING;

-- Verificar antes de continuar:
-- SELECT count(*) FROM jira_ticket_subtasks;

-- ─── PASO 3: Eliminar columna obsoleta ───────────────────────────────────────
-- Ejecutar SOLO después de verificar que el backfill fue exitoso

ALTER TABLE jira_tickets DROP COLUMN IF EXISTS subtask_keys;

-- Nota: linked_keys nunca existió como columna en BD → no hay nada que eliminar
