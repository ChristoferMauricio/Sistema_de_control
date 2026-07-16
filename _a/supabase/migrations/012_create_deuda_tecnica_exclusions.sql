-- 012_create_deuda_tecnica_exclusions.sql
-- Tabla para excluir historias específicas de la clasificación de Deuda Técnica,
-- manteniendo trazabilidad del valor original antes de la exclusión.

CREATE TABLE IF NOT EXISTS public.deuda_tecnica_exclusions (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  story_key text NOT NULL UNIQUE,
  original_created_sprint text NOT NULL,
  current_sprint text NOT NULL,
  reason text,
  excluded_at timestamp with time zone DEFAULT now(),
  CONSTRAINT deuda_tecnica_exclusions_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_dte_story_key ON public.deuda_tecnica_exclusions(story_key);

-- Habilitar Row Level Security
ALTER TABLE public.deuda_tecnica_exclusions ENABLE ROW LEVEL SECURITY;

-- Política de lectura para usuarios autenticados
DROP POLICY IF EXISTS "Authenticated users can read deuda_tecnica_exclusions" ON public.deuda_tecnica_exclusions;
CREATE POLICY "Authenticated users can read deuda_tecnica_exclusions"
  ON public.deuda_tecnica_exclusions
  FOR SELECT
  TO authenticated
  USING (true);

-- Insertar las 3 exclusiones iniciales con auditoría
INSERT INTO public.deuda_tecnica_exclusions (story_key, original_created_sprint, current_sprint, reason)
VALUES
  ('PF3-4523', 'Iteración F3.15', 'Iteración F3.16', 'Excluida manualmente por el usuario - no es deuda técnica real'),
  ('PF3-4513', 'Iteración F3.15', 'Iteración F3.16', 'Excluida manualmente por el usuario - no es deuda técnica real'),
  ('PF3-4518', 'Iteración F3.15', 'Iteración F3.16', 'Excluida manualmente por el usuario - no es deuda técnica real')
ON CONFLICT (story_key) DO NOTHING;
