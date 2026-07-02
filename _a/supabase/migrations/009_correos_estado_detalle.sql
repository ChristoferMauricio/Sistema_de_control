-- Migration: Añadir "estado" y "detalle" a los recuadros de Correos pendientes
-- y ampliar las acciones registrables en el historial de trazabilidad.

-- Nuevas columnas del recuadro
ALTER TABLE public.correos_pendientes ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'Pendiente';
ALTER TABLE public.correos_pendientes ADD COLUMN IF NOT EXISTS detalle text NOT NULL DEFAULT '';

-- Estados permitidos
ALTER TABLE public.correos_pendientes DROP CONSTRAINT IF EXISTS check_estado_correo;
ALTER TABLE public.correos_pendientes ADD CONSTRAINT check_estado_correo
  CHECK (estado IN ('Pendiente', 'En proceso o espera', 'Finalizado o Atendido', 'Falta respuesta'));

-- Nuevas acciones de trazabilidad. NOTA: para 'estado_editado' y 'detalle_editado'
-- las columnas titulo_anterior / titulo_nuevo del historial se reutilizan como
-- valor_anterior / valor_nuevo genéricos (evita añadir 4 columnas más).
ALTER TABLE public.correos_pendientes_historial DROP CONSTRAINT IF EXISTS check_accion;
ALTER TABLE public.correos_pendientes_historial ADD CONSTRAINT check_accion
  CHECK (accion IN ('creacion', 'imagen_subida', 'imagen_reemplazada', 'titulo_editado', 'estado_editado', 'detalle_editado', 'eliminacion'));
