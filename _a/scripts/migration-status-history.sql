-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN: Tabla de Historial de Cambios de Estado
-- Ejecutar este script en: Supabase > SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ─── Tabla: jira_ticket_status_history ────────────────────
-- Registra cada cambio de estado de un ticket para gráficos
-- de seguimiento (burndown, cumulative flow, tiempo en estado)

CREATE TABLE IF NOT EXISTS jira_ticket_status_history (
  id              SERIAL PRIMARY KEY,
  jira_key        TEXT NOT NULL,                 -- Ej: PF3-3157
  old_status      TEXT,                          -- Estado anterior (NULL = ticket nuevo)
  new_status      TEXT NOT NULL,                 -- Estado nuevo
  changed_at      TIMESTAMPTZ DEFAULT NOW(),     -- Cuándo se detectó el cambio
  CONSTRAINT fk_history_ticket FOREIGN KEY (jira_key)
    REFERENCES jira_tickets(jira_key) ON DELETE CASCADE
);

-- Índices para consultas de historial
CREATE INDEX IF NOT EXISTS idx_status_history_key ON jira_ticket_status_history (jira_key);
CREATE INDEX IF NOT EXISTS idx_status_history_date ON jira_ticket_status_history (changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_history_new ON jira_ticket_status_history (new_status);

-- ─── RLS ──────────────────────────────────────────────────
-- Usuarios autenticados pueden leer, escritura solo via service_role

ALTER TABLE jira_ticket_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read status history"
  ON jira_ticket_status_history
  FOR SELECT
  TO authenticated
  USING (true);

-- ─── Insertar estado inicial de tickets existentes ────────
-- Crea un registro de historial para cada ticket ya sincronizado
-- (así hay un punto de partida para los gráficos)

INSERT INTO jira_ticket_status_history (jira_key, old_status, new_status, changed_at)
SELECT jira_key, NULL, status, synced_at
FROM jira_tickets
WHERE status IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM jira_ticket_status_history h
    WHERE h.jira_key = jira_tickets.jira_key
  );
