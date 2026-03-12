const path = require('path');
const fs = require('fs');

// Load env vars
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const { createClient } = require('@supabase/supabase-js');

// Must use service role if there's RLS
const supabase = createClient(
  envVars.NEXT_PUBLIC_SUPABASE_URL,
  envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function test() {
  console.log("Fetching Epic PF3-1799 stories (using service role)...");
  
  // Try to find any ticket containing 'Iteració'
  const { data, error } = await supabase
    .from('jira_tickets')
    .select('jira_key, summary, issue_type, parent_key')
    .ilike('summary', '%iteraci%')
    .limit(10);
  
  if (error) {
    console.error("Error:", error);
    return;
  }
  
  console.log(`Found ${data.length} potential iteration stories:`);
  console.log(JSON.stringify(data, null, 2));

  console.log("Testing Nombres table...");
  const { data: nData, error: nError } = await supabase
      .from('Nombres')
      .select('*')
      .limit(5);
  console.log(nError ? "Error Nombres" : "Nombres keys:", nData?.[0] ? Object.keys(nData[0]) : "Empty");
}

test();
