-- =============================================================================
-- Migración 003: FN3 — Tabla jira_persons (elimina dependencia transitiva)
-- assignee_name depende de assignee_email, no de jira_key → viola FN3
-- reporter_name depende de reporter_email → mismo problema
-- Ejecutar DESPUÉS de la migración 002
-- =============================================================================

-- ─── PASO 1: Crear tabla jira_persons ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jira_persons (
  email        TEXT PRIMARY KEY,
  display_name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_persons_email ON jira_persons(email);

-- ─── PASO 2: Backfill desde jira_tickets ─────────────────────────────────────

-- Desde asignados
INSERT INTO jira_persons (email, display_name)
SELECT DISTINCT assignee_email, assignee_name
FROM   jira_tickets
WHERE  assignee_email IS NOT NULL
  AND  assignee_name  IS NOT NULL
  AND  assignee_email <> ''
ON CONFLICT (email) DO UPDATE
  SET display_name = EXCLUDED.display_name;

-- Desde reporteros
INSERT INTO jira_persons (email, display_name)
SELECT DISTINCT reporter_email, reporter_name
FROM   jira_tickets
WHERE  reporter_email IS NOT NULL
  AND  reporter_name  IS NOT NULL
  AND  reporter_email <> ''
ON CONFLICT (email) DO UPDATE
  SET display_name = EXCLUDED.display_name;

-- Verificar antes de continuar:
-- SELECT count(*) FROM jira_persons;
-- SELECT * FROM jira_persons LIMIT 20;

-- ─── PASO 3: Eliminar columnas redundantes ────────────────────────────────────
-- Ejecutar SOLO después de verificar que el backfill fue exitoso
-- Y después de haber desplegado el nuevo código de sync y del frontend

ALTER TABLE jira_tickets DROP COLUMN IF EXISTS assignee_name;
ALTER TABLE jira_tickets DROP COLUMN IF EXISTS reporter_name;

-- ─── (Opcional) FK constraints ───────────────────────────────────────────────
-- Descomentar si se desea integridad referencial estricta.
-- No recomendado si Jira puede enviar tickets con asignados no registrados aún.
--
-- ALTER TABLE jira_tickets
--   ADD CONSTRAINT fk_assignee FOREIGN KEY (assignee_email)
--   REFERENCES jira_persons(email) ON DELETE SET NULL;
--
-- ALTER TABLE jira_tickets
--   ADD CONSTRAINT fk_reporter FOREIGN KEY (reporter_email)
--   REFERENCES jira_persons(email) ON DELETE SET NULL;
