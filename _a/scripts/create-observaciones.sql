-- ═══════════════════════════════════════════════════════════
-- MIGRACIÓN: Tabla de Observaciones
-- Ejecutar en: Supabase > SQL Editor
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS observaciones (
  id                  SERIAL PRIMARY KEY,
  sprint              TEXT,
  modulo              TEXT,
  submodulo           TEXT,
  descripcion         TEXT,                           -- Markdown
  obs_word_link       TEXT,                           -- URL al documento WORD
  ambiente            TEXT,                           -- Desarrollo, Certificación, Producción
  quien_detecto       TEXT,                           -- Nombre de tabla Nombres
  fecha_registro      DATE DEFAULT CURRENT_DATE,
  quien_corrigio      TEXT,                           -- Nombre de tabla Nombres
  estado              TEXT DEFAULT 'Registro',        -- Registro, En Revisión, Resuelto
  fecha_modificacion  DATE,
  observacion_final   TEXT,                           -- Markdown
  solucion_word_link  TEXT,                           -- URL al documento WORD
  created_by          UUID,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_observaciones_sprint ON observaciones (sprint);
CREATE INDEX IF NOT EXISTS idx_observaciones_modulo ON observaciones (modulo);
CREATE INDEX IF NOT EXISTS idx_observaciones_estado ON observaciones (estado);

-- RLS
ALTER TABLE observaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read observaciones" ON observaciones;
CREATE POLICY "Authenticated users can read observaciones"
  ON observaciones FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert observaciones" ON observaciones;
CREATE POLICY "Authenticated users can insert observaciones"
  ON observaciones FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update observaciones" ON observaciones;
CREATE POLICY "Authenticated users can update observaciones"
  ON observaciones FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete observaciones" ON observaciones;
CREATE POLICY "Authenticated users can delete observaciones"
  ON observaciones FOR DELETE TO authenticated USING (true);

-- RLS para tabla Nombres (lectura para autenticados)
ALTER TABLE "Nombres" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read nombres" ON "Nombres";
CREATE POLICY "Authenticated users can read nombres"
  ON "Nombres" FOR SELECT TO authenticated USING (true);
