const { createClient } = require("@supabase/supabase-js");
require("dotenv").config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing SUPABASE env vars");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
  console.log("Testing match_documentos RPC...");
  const dummyVector = Array(768).fill(0.0);
  
  const { data, error } = await supabase.rpc("match_documentos", {
    query_embedding: dummyVector,
    match_threshold: 0.3,
    match_count: 5,
    filter_epic_key: null
  });

  if (error) {
    console.error("Error from RPC:", error);
  } else {
    console.log("Success! Match count:", data.length);
  }
}

test();
