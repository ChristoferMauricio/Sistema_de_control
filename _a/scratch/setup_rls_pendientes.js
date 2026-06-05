import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://xfgxppsnuavnfrsyusqf.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmZ3hwcHNudWF2bmZyc3l1c3FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4Mjc0OCwiZXhwIjoyMDg4NTU4NzQ4fQ.3EKWak-5cmrvbWKVRj0k-w66qjzpJmmtk4PkF0UjV9Y";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function setupRLS() {
  // SQL statements to enable RLS and create policies for pendientes and pendiente_asunto_history
  const statements = [
    // ─── Table: pendientes ───
    // Enable RLS (may already be enabled, that's ok)
    `ALTER TABLE public.pendientes ENABLE ROW LEVEL SECURITY;`,
    
    // Drop existing policies if any (to avoid conflicts)
    `DROP POLICY IF EXISTS "pendientes_select_authenticated" ON public.pendientes;`,
    `DROP POLICY IF EXISTS "pendientes_insert_authenticated" ON public.pendientes;`,
    `DROP POLICY IF EXISTS "pendientes_update_authenticated" ON public.pendientes;`,
    `DROP POLICY IF EXISTS "pendientes_delete_authenticated" ON public.pendientes;`,
    
    // Create policies: any authenticated user can SELECT, INSERT, UPDATE, DELETE
    `CREATE POLICY "pendientes_select_authenticated" ON public.pendientes FOR SELECT TO authenticated USING (true);`,
    `CREATE POLICY "pendientes_insert_authenticated" ON public.pendientes FOR INSERT TO authenticated WITH CHECK (true);`,
    `CREATE POLICY "pendientes_update_authenticated" ON public.pendientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);`,
    `CREATE POLICY "pendientes_delete_authenticated" ON public.pendientes FOR DELETE TO authenticated USING (true);`,
    
    // ─── Table: pendiente_asunto_history ───
    `ALTER TABLE public.pendiente_asunto_history ENABLE ROW LEVEL SECURITY;`,
    
    `DROP POLICY IF EXISTS "history_select_authenticated" ON public.pendiente_asunto_history;`,
    `DROP POLICY IF EXISTS "history_insert_authenticated" ON public.pendiente_asunto_history;`,
    `DROP POLICY IF EXISTS "history_update_authenticated" ON public.pendiente_asunto_history;`,
    `DROP POLICY IF EXISTS "history_delete_authenticated" ON public.pendiente_asunto_history;`,
    
    `CREATE POLICY "history_select_authenticated" ON public.pendiente_asunto_history FOR SELECT TO authenticated USING (true);`,
    `CREATE POLICY "history_insert_authenticated" ON public.pendiente_asunto_history FOR INSERT TO authenticated WITH CHECK (true);`,
    `CREATE POLICY "history_update_authenticated" ON public.pendiente_asunto_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);`,
    `CREATE POLICY "history_delete_authenticated" ON public.pendiente_asunto_history FOR DELETE TO authenticated USING (true);`,
  ];

  console.log("Setting up RLS policies for pendientes tables...\n");

  for (const sql of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
    if (error) {
      // If rpc doesn't exist, try another approach
      console.log(`⚠ RPC exec_sql failed for: ${sql.substring(0, 60)}...`);
      console.log(`  Error: ${error.message}`);
    } else {
      console.log(`✓ ${sql.substring(0, 70)}...`);
    }
  }
  
  console.log("\nDone!");
}

setupRLS();
