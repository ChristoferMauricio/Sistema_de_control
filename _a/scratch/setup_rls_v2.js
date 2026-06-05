// Uses the Supabase Management API to run SQL via the pg_query endpoint
// Reference: https://supabase.com/docs/reference/management-api

const SUPABASE_URL = "https://xfgxppsnuavnfrsyusqf.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmZ3hwcHNudWF2bmZyc3l1c3FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4Mjc0OCwiZXhwIjoyMDg4NTU4NzQ4fQ.3EKWak-5cmrvbWKVRj0k-w66qjzpJmmtk4PkF0UjV9Y";

const sql = `
-- ─── Table: pendientes ───
ALTER TABLE public.pendientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pendientes_select_authenticated" ON public.pendientes;
DROP POLICY IF EXISTS "pendientes_insert_authenticated" ON public.pendientes;
DROP POLICY IF EXISTS "pendientes_update_authenticated" ON public.pendientes;
DROP POLICY IF EXISTS "pendientes_delete_authenticated" ON public.pendientes;

CREATE POLICY "pendientes_select_authenticated" ON public.pendientes FOR SELECT TO authenticated USING (true);
CREATE POLICY "pendientes_insert_authenticated" ON public.pendientes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "pendientes_update_authenticated" ON public.pendientes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "pendientes_delete_authenticated" ON public.pendientes FOR DELETE TO authenticated USING (true);

-- ─── Table: pendiente_asunto_history ───
ALTER TABLE public.pendiente_asunto_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "history_select_authenticated" ON public.pendiente_asunto_history;
DROP POLICY IF EXISTS "history_insert_authenticated" ON public.pendiente_asunto_history;
DROP POLICY IF EXISTS "history_update_authenticated" ON public.pendiente_asunto_history;
DROP POLICY IF EXISTS "history_delete_authenticated" ON public.pendiente_asunto_history;

CREATE POLICY "history_select_authenticated" ON public.pendiente_asunto_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "history_insert_authenticated" ON public.pendiente_asunto_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "history_update_authenticated" ON public.pendiente_asunto_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "history_delete_authenticated" ON public.pendiente_asunto_history FOR DELETE TO authenticated USING (true);
`;

async function runSQL() {
  console.log("Executing SQL via Supabase REST endpoint...\n");
  
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({ query: sql }),
  });

  console.log("Status:", response.status, response.statusText);
  const text = await response.text();
  console.log("Response:", text);
  
  // If that didn't work, try the pg-meta endpoint
  if (!response.ok) {
    console.log("\nTrying alternative: pg-meta SQL endpoint...");
    const response2 = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    });
    console.log("Status:", response2.status, response2.statusText);
    const text2 = await response2.text();
    console.log("Response:", text2);
  }
}

runSQL();
