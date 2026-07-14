-- ═══════════════════════════════════════════════════════════
-- JIRA DASHBOARD — Esquema de Base de Datos (Supabase)
-- Ejecutar este script en: Supabase > SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ─── Tabla: jira_tickets ───────────────────────────────────
-- Almacena los tickets sincronizados desde Jira

CREATE TABLE IF NOT EXISTS jira_tickets (
  id              SERIAL PRIMARY KEY,
  jira_key        TEXT UNIQUE NOT NULL,        -- Ej: PGIM-F3-123
  summary         TEXT,                         -- Resumen del ticket
  status          TEXT,                         -- Estado (To Do, In Progress, Certificación, Producción, Done)
  assignee_email  TEXT,                         -- Email del asignado en Jira
  assignee_name   TEXT,                         -- Nombre visible del asignado
  priority        TEXT,                         -- Prioridad (Highest, High, Medium, Low, Lowest)
  issue_type      TEXT,                         -- Tipo (Bug, Story, Task, Sub-task, Epic)
  sprint          TEXT,                         -- Sprint activo (ej: "Sprint 5")
  created_sprint  TEXT,                         -- Primer sprint al que fue asociada
  story_points    NUMERIC,                     -- Story points (solo aplica para Historias)
  reporter_name   TEXT,                         -- Nombre del informador
  reporter_email  TEXT,                         -- Email del informador
  parent_key      TEXT,                         -- Clave del issue padre (ej: PGIM-F3-100)
  subtask_keys    TEXT[],                       -- Array de claves de subtareas
  created_at      TIMESTAMPTZ,                 -- Fecha de creación en Jira
  updated_at      TIMESTAMPTZ,                 -- Última actualización en Jira
  synced_at       TIMESTAMPTZ DEFAULT NOW()    -- Última sincronización
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_jira_tickets_status ON jira_tickets (status);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_assignee ON jira_tickets (assignee_email);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_updated ON jira_tickets (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_issue_type ON jira_tickets (issue_type);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_sprint ON jira_tickets (sprint);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_parent ON jira_tickets (parent_key);

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

-- ─── Tabla: team_roles ─────────────────────────────────────
-- Define el rol de cada usuario dentro del dashboard

CREATE TABLE IF NOT EXISTS team_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'viewer',  -- Roles: admin, developer, qa, viewer
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Índice para búsqueda por user_id
CREATE INDEX IF NOT EXISTS idx_team_roles_user ON team_roles (user_id);

-- Índice único para evitar roles duplicados
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_roles_unique ON team_roles (user_id);


-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════

-- ─── RLS para jira_tickets ─────────────────────────────────
-- Todos los usuarios autenticados pueden leer, solo service role puede escribir

ALTER TABLE jira_tickets ENABLE ROW LEVEL SECURITY;

-- Política de lectura: cualquier usuario autenticado
DROP POLICY IF EXISTS "Authenticated users can read tickets" ON jira_tickets;
CREATE POLICY "Authenticated users can read tickets"
  ON jira_tickets
  FOR SELECT
  TO authenticated
  USING (true);

-- Política de inserción/actualización: solo service_role (para el sync script)
-- Nota: service_role bypassa RLS por defecto en Supabase

-- ─── RLS para jira_ticket_status_history ──────────────────
-- Usuarios autenticados pueden leer el historial, escritura solo via service_role

ALTER TABLE jira_ticket_status_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read status history" ON jira_ticket_status_history;
CREATE POLICY "Authenticated users can read status history"
  ON jira_ticket_status_history
  FOR SELECT
  TO authenticated
  USING (true);

-- ─── RLS para team_roles ───────────────────────────────────
-- Cada usuario solo puede ver su propio rol

ALTER TABLE team_roles ENABLE ROW LEVEL SECURITY;

-- Función SECURITY DEFINER para verificar admin sin recursión RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Política de lectura: solo tu propio registro
DROP POLICY IF EXISTS "Users can read own role" ON team_roles;
CREATE POLICY "Users can read own role"
  ON team_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Política de lectura para admins (usando función sin recursión)
DROP POLICY IF EXISTS "Admins can read all roles" ON team_roles;
CREATE POLICY "Admins can read all roles"
  ON team_roles
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- ─── Tabla: hu_reportadas ──────────────────────────────────
-- Almacena las historias reportadas importadas de Excel
CREATE TABLE IF NOT EXISTS hu_reportadas (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  epic_key        TEXT,
  epic_summary    TEXT,
  story_key       TEXT UNIQUE NOT NULL,
  story_summary   TEXT,
  story_points    NUMERIC,
  sprint          TEXT,
  nota            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies for hu_reportadas
ALTER TABLE hu_reportadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read hu_reportadas" ON hu_reportadas;
CREATE POLICY "Authenticated users can read hu_reportadas"
  ON hu_reportadas
  FOR SELECT
  TO authenticated
  USING (true);

