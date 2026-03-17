require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testFetch() {
  const { data: bugsQA, error } = await supabase
    .from('jira_tickets')
    .select('*')
    .in('issue_type', ['Bug', 'Error', 'Error Desarrollo', 'Error Certificación', 'Error en Certificación'])
    .like('jira_key', 'PF3QA-%');

  console.log('Total bugs in PF3QA:', bugsQA?.length || 0);
  if (error) console.error('Error fetching bugs:', error);

  if (bugsQA && bugsQA.length > 0) {
    console.log('Sample Sprint string for bugs:', bugsQA[0].sprint);
    console.log('Bugs with Tablero Sprint 2:', bugsQA.filter(b => b.sprint === 'Tablero Sprint 2').length);
    console.log('Sample bug with linked keys:', JSON.stringify(bugsQA.find(b => Array.isArray(b.linked_keys) && b.linked_keys.length > 0)?.linked_keys));
  }
}

testFetch();
