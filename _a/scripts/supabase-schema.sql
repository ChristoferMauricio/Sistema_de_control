-- ═══════════════════════════════════════════════════════════
-- JIRA DASHBOARD — Esquema de Base de Datos (Supabase)
-- Ejecutar este script en: Supabase > SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ─── Tabla: jira_tickets ───────────────────────────────────
-- Almacena los tickets sincronizados desde Jira

CREATE TABLE IF NOT EXISTS jira_tickets (
  id            SERIAL PRIMARY KEY,
  jira_key      TEXT UNIQUE NOT NULL,        -- Ej: PROJ-123
  summary       TEXT,                         -- Resumen del ticket
  status        TEXT,                         -- Estado (To Do, In Progress, Certificación, Producción, Done)
  assignee_email TEXT,                        -- Email del asignado en Jira
  assignee_name TEXT,                         -- Nombre visible del asignado
  priority      TEXT,                         -- Prioridad (Highest, High, Medium, Low, Lowest)
  issue_type    TEXT,                         -- Tipo (Bug, Story, Task, Epic, etc.)
  created_at    TIMESTAMPTZ,                 -- Fecha de creación en Jira
  updated_at    TIMESTAMPTZ,                 -- Última actualización en Jira
  synced_at     TIMESTAMPTZ DEFAULT NOW()    -- Última sincronización
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_jira_tickets_status ON jira_tickets (status);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_assignee ON jira_tickets (assignee_email);
CREATE INDEX IF NOT EXISTS idx_jira_tickets_updated ON jira_tickets (updated_at DESC);

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

-- Política de lectura: solo tu propio registro
DROP POLICY IF EXISTS "Users can read own role" ON team_roles;
CREATE POLICY "Users can read own role"
  ON team_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Política de lectura para admins: un admin puede ver todos los roles
DROP POLICY IF EXISTS "Admins can read all roles" ON team_roles;
CREATE POLICY "Admins can read all roles"
  ON team_roles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_roles tr
      WHERE tr.user_id = auth.uid()
      AND tr.role = 'admin'
    )
  );


-- ═══════════════════════════════════════════════════════════
-- DATOS DE EJEMPLO (Opcional — para testing)
-- ═══════════════════════════════════════════════════════════

-- Descomenta las líneas siguientes para insertar datos de prueba

-- INSERT INTO jira_tickets (jira_key, summary, status, assignee_email, assignee_name, priority, issue_type, created_at, updated_at) VALUES
-- ('PROJ-001', 'Implementar autenticación OAuth', 'In Progress', 'dev@ejemplo.com', 'Juan Pérez', 'High', 'Story', NOW() - INTERVAL '5 days', NOW() - INTERVAL '1 hour'),
-- ('PROJ-002', 'Fix: Error en cálculo de totales', 'Certificación', 'qa@ejemplo.com', 'María García', 'Highest', 'Bug', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 hours'),
-- ('PROJ-003', 'Bug crítico en producción - Login falla', 'Producción', 'dev@ejemplo.com', 'Juan Pérez', 'Highest', 'Bug', NOW() - INTERVAL '1 day', NOW() - INTERVAL '30 minutes'),
-- ('PROJ-004', 'Agregar validación de formularios', 'To Do', 'dev2@ejemplo.com', 'Carlos López', 'Medium', 'Task', NOW() - INTERVAL '7 days', NOW() - INTERVAL '4 hours'),
-- ('PROJ-005', 'Optimizar queries de base de datos', 'Done', 'dev@ejemplo.com', 'Juan Pérez', 'Low', 'Task', NOW() - INTERVAL '10 days', NOW() - INTERVAL '1 day');
