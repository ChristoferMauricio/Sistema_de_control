const fs = require('fs');
const path = require('path');

function searchDir(dir, query) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        searchDir(fullPath, query);
      }
    } else {
      if (file.endsWith('.js') || file.endsWith('.jsx')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.toLowerCase().includes(query.toLowerCase())) {
          console.log(`Match for "${query}" in: ${fullPath}`);
        }
      }
    }
  }
}

const target = 'd:\\OneDrive_UNI\\OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA\\Desktop\\PGIM\\_SISTEMA\\Sistema_de_control\\_a';
searchDir(target, 'observaciones');
searchDir(target, 'reuniones');
