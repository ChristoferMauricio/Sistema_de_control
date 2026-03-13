const str = `*Nota:*

* Usuario reportante: Magaly Curi
* fecha: mar, 10 mar, 11:09
* Correo: Solicitud: INCIDENCIA EN EL PGIM`;

const parseReporter = (description) => {
  if (!description) return null;
  
  // Primero buscar reportante
  let match = description.match(/Usuario reportante:\s*([^\n\r\*]+)/i) || 
              description.match(/Usuario\s*reportante:\s*([^\n\r\*]+)/i) ||
              description.match(/Reportante:\s*([^\n\r\*]+)/i);
              
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Luego buscar solicitante
  let solicitanteMatch = description.match(/Usuario solicitante:\s*([^\n\r\*]+)/i) || 
                         description.match(/Usuario\s*solicitante:\s*([^\n\r\*]+)/i) ||
                         description.match(/Solicitante:\s*([^\n\r\*]+)/i);
                         
  if (solicitanteMatch && solicitanteMatch[1]) {
    return solicitanteMatch[1].trim();
  }
  
  return null;
};

console.log("OLD REGEX RESULTS:");
let matchOld = str.match(/Usuario reportante:\s*(.+)/i);
console.log("Old Match:", matchOld ? matchOld[1].trim() : "null");

console.log("NEW FUNCTION:");
console.log(parseReporter(str));
