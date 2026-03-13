import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = "https://xfgxppsnuavnfrsyusqf.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhmZ3hwcHNudWF2bmZyc3l1c3FmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk4Mjc0OCwiZXhwIjoyMDg4NTU4NzQ4fQ.3EKWak-5cmrvbWKVRj0k-w66qjzpJmmtk4PkF0UjV9Y"; 

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function testSupabaseDesc() {
  const { data, error } = await supabase
    .from("jira_tickets")
    .select("jira_key, summary, description")
    .in("jira_key", ["PF3-3177", "PF3-3176", "PF3-3175", "PF3-3174"]);

  if (error) {
    console.error("Error:", error);
    return;
  }

  let outStr = `Found tickets in Supabase: ${data.length}\n`;
  data.forEach(t => {
    outStr += `\n=== TICKET: ${t.jira_key} ===\n`;
    if (!t.description) {
      outStr += "No description at all!\n";
    } else {
      outStr += `Contains 'Usuario reportante': ${/Usuario reportante/i.test(t.description)}\n`;
      outStr += `Contains 'Usuario solicitante': ${/Usuario solicitante/i.test(t.description)}\n`;
      outStr += `Description preview:\n${t.description.substring(0, 200).replace(/\n/g, '\\n')}\n`;
    }
  });
  
  fs.writeFileSync('out3.txt', outStr);
  console.log("Wrote logic to out3.txt");
}

testSupabaseDesc();
