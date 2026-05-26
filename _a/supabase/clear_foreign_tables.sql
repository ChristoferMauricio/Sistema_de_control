-- ═══════════════════════════════════════════════════════════════════════════════════════
-- SCRIPT DE SANEAMIENTO: Limpieza de Tablas Ajenas al Gestor Jira (AHP/TOPSIS/Logística)
-- Ejecutar en: Supabase Dashboard → SQL Editor (una sola vez)
--
-- PROPÓSITO:
--   Elimina de forma segura y permanente las 16 tablas del proyecto de evaluación
--   de proveedores que fueron creadas accidentalmente en la base de datos de Jira.
--   Utiliza CASCADE para limpiar automáticamente dependencias, llaves foráneas y vistas.
-- ═══════════════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Eliminar tablas con dependencias cruzadas profundas (Detalles y Logs)
DROP TABLE IF EXISTS public.audit_log CASCADE;
DROP TABLE IF EXISTS public.documentos_embeddings CASCADE;
DROP TABLE IF EXISTS public.sla_definiciones CASCADE;
DROP TABLE IF EXISTS public.no_conformidades CASCADE;
DROP TABLE IF EXISTS public.recepciones_detalle CASCADE;
DROP TABLE IF EXISTS public.recepciones CASCADE;
DROP TABLE IF EXISTS public.ordenes_compra_detalle CASCADE;
DROP TABLE IF EXISTS public.ordenes_compra CASCADE;

-- 2. Eliminar tablas de relaciones y cálculos matemáticos (AHP, TOPSIS, TCO)
DROP TABLE IF EXISTS public.materiales_proveedores CASCADE;
DROP TABLE IF EXISTS public.materiales CASCADE;
DROP TABLE IF EXISTS public.evaluaciones CASCADE;
DROP TABLE IF EXISTS public.pesos_ahp CASCADE;
DROP TABLE IF EXISTS public.comparaciones_ahp CASCADE;
DROP TABLE IF EXISTS public.criterios_ahp CASCADE;

-- 3. Eliminar tablas maestras principales (Proveedores y Empresas)
DROP TABLE IF EXISTS public.proveedores CASCADE;
DROP TABLE IF EXISTS public.empresas CASCADE;

COMMIT;

-- Mensaje de éxito para el editor de Supabase:
SELECT 'Saneamiento completado con éxito. La base de datos del Gestor Jira ha sido limpiada.' AS resultado;
