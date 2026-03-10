-- ═══════════════════════════════════════════════════════════
-- FIX: Corregir recursión infinita en RLS de team_roles
-- Ejecutar en: Supabase > SQL Editor
-- ═══════════════════════════════════════════════════════════

-- 1. Eliminar la política problemática que causa recursión infinita
DROP POLICY IF EXISTS "Admins can read all roles" ON team_roles;

-- 2. Eliminar la política actual de lectura propia
DROP POLICY IF EXISTS "Users can read own role" ON team_roles;

-- 3. Crear UNA sola política simple: cada usuario puede leer su propio rol
CREATE POLICY "Users can read own role"
  ON team_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- 4. Crear función SECURITY DEFINER para que admins puedan ver todos los roles
--    (esto evita la recursión porque bypasa RLS)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- 5. Política para admins usando la función (sin recursión)
CREATE POLICY "Admins can read all roles"
  ON team_roles
  FOR SELECT
  TO authenticated
  USING (is_admin());
