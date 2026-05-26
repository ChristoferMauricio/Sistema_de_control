-- =============================================================================
-- MIGRACIÓN 006: Configuración del Motor RAG Vectorial (Gestor de Conocimiento)
-- Ejecutar en: Supabase Dashboard → SQL Editor (una sola vez)
--
-- PROPÓSITO:
--   Habilita la extensión pgvector, crea la estructura relacional-vectorial
--   y define la función RPC para búsquedas de similitud de coseno híbridas.
-- =============================================================================

-- 1. Habilitar la extensión vectorial en la base de datos de Supabase
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Crear la tabla de almacenamiento para embeddings de documentos y tickets
CREATE TABLE IF NOT EXISTS public.documentos_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(50) NOT NULL,          -- 'jira_ticket' o 'documento_subido'
  source_key VARCHAR(100) NOT NULL,          -- Clave (ej: 'PF3-1799' o nombre del archivo)
  content TEXT NOT NULL,                     -- Fragmento de texto enriquecido con metadatos
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb, -- Metadatos (sprint, asignado, tipo, tags, etc.)
  embedding public.vector(1536),             -- Vector de 1536 dimensiones (text-embedding-004 de Gemini)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Crear índice vectorial HNSW para búsquedas de similitud de coseno ultrarápidas (Plan Free)
CREATE INDEX IF NOT EXISTS idx_documentos_embeddings_vector 
  ON public.documentos_embeddings USING hnsw (embedding vector_cosine_ops);

-- 4. Índices para filtros relacionales rápidos en consultas híbridas
CREATE INDEX IF NOT EXISTS idx_documentos_embeddings_source
  ON public.documentos_embeddings (source_type, source_key);

CREATE INDEX IF NOT EXISTS idx_documentos_embeddings_metadata_epic
  ON public.documentos_embeddings ((metadata->>'epic_key'))
  WHERE (metadata->>'epic_key' IS NOT NULL);


-- 5. Función de búsqueda vectorial híbrida por similitud (RPC para Supabase)
--    Calcula la distancia de coseno (operator <=>) y filtra opcionalmente por Épica relacional.
CREATE OR REPLACE FUNCTION public.match_documentos (
  query_embedding public.vector(1536),
  match_threshold float,
  match_count int,
  filter_epic_key text DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_type varchar,
  source_key varchar,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    documentos_embeddings.id,
    documentos_embeddings.source_type,
    documentos_embeddings.source_key,
    documentos_embeddings.content,
    documentos_embeddings.metadata,
    1 - (documentos_embeddings.embedding <=> query_embedding) AS similarity
  FROM public.documentos_embeddings
  WHERE 1 - (documentos_embeddings.embedding <=> query_embedding) > match_threshold
    AND (
      filter_epic_key IS NULL 
      OR documentos_embeddings.metadata->>'epic_key' = filter_epic_key
      OR documentos_embeddings.source_key = filter_epic_key
    )
  ORDER BY documentos_embeddings.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
