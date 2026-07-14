-- 011_create_hu_reportadas.sql
-- Create table for storing reported stories from "Historias reportadas.xlsx"

CREATE TABLE IF NOT EXISTS public.hu_reportadas (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  epic_key text,
  epic_summary text,
  story_key text NOT NULL UNIQUE,
  story_summary text,
  story_points numeric,
  sprint text,
  nota text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT hu_reportadas_pkey PRIMARY KEY (id)
);

-- Index for searching stories
CREATE INDEX IF NOT EXISTS idx_hu_reportadas_story_key ON public.hu_reportadas(story_key);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.hu_reportadas ENABLE ROW LEVEL SECURITY;

-- Crear política de lectura para usuarios autenticados
DROP POLICY IF EXISTS "Authenticated users can read hu_reportadas" ON public.hu_reportadas;
CREATE POLICY "Authenticated users can read hu_reportadas"
  ON public.hu_reportadas
  FOR SELECT
  TO authenticated
  USING (true);
