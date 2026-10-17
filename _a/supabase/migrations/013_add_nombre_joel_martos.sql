-- Agregar mapeo: Programador.pgim9 → Joel Martos
INSERT INTO public."Nombres" ("Nombre", "Programador")
VALUES ('Joel Martos', 'Programador.pgim9')
ON CONFLICT DO NOTHING;
