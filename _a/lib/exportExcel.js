/**
 * @file lib/exportExcel.js - Módulo compartido de exportación a Excel
 * @description Genera un Excel unificado con 5 hojas:
 *   - "Tabla dinámica": pivot por Persona/Estado (del template, pivots 1+2)
 *   - "Osi": datos crudos de TODOS los tickets (fuente de pivots 1-3)
 *   - "Reporte por Épica": pivot por Épica (del template, pivot 3)
 *   - "Datos QA": datos crudos de tickets PF3QA con formato estético
 *   - "Reporte QA": 2 tablas dinámicas azules con filtros aplicados
 *
 * Usado por: ReportesTable.js y errores-estadisticas/page.js
 */

import JSZip from "jszip";
import { supabase } from "@/lib/supabase";
// sortSprints ya no se necesita — los pivots usan refreshOnLoad

const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

/** Escapa caracteres especiales XML y elimina caracteres de control inválidos */
function escXml(s) {
  return String(s || "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "") // caracteres de control inválidos en XML
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Exporta un Excel unificado con todos los datos y tablas dinámicas.
 * @param {string|null} selectedSprint - Sprint seleccionado (para el nombre del archivo)
 */
export async function exportUnifiedExcel(selectedSprint) {
  try {
    /* ═══════════════════════════════════════════════════════════════
       1. OBTENER DATOS DE SUPABASE (con paginación para tickets)
       ═══════════════════════════════════════════════════════════════ */
    // Supabase limita a 1000 filas por consulta, se pagina igual que en la página
    const [equipoRes, personsRes] = await Promise.all([
      supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
      supabase.from("jira_persons").select("email, display_name"),
    ]);

    // Paginación de tickets (batches de 1000)
    let allTickets = [];
    const pageSize = 1000;
    let from = 0;
    let hasMore = true;
    while (hasMore) {
      const { data, error } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary, status, issue_type, sprint, story_points, assignee_email, reporter_email, parent_key, created_at, updated_at, subtask_keys, comentario, priority")
        .order("updated_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error || !data) { hasMore = false; break; }
      allTickets = [...allTickets, ...data];
      from += pageSize;
      hasMore = data.length === pageSize;
    }

    const equipo = equipoRes.data || [];
    const persons = personsRes.data || [];

    /* ═══════════════════════════════════════════════════════════════
       2. FUNCIONES AUXILIARES
       ═══════════════════════════════════════════════════════════════ */
    const equipoEmailMap = {};
    equipo.forEach((e) => {
      if (e.correo_pgim) equipoEmailMap[e.correo_pgim.toLowerCase()] = e.nombre;
      if (e.correo_gcorp) equipoEmailMap[e.correo_gcorp.toLowerCase()] = e.nombre;
    });
    const equipoKeyMap = {};
    equipo.forEach((e) => {
      if (e.nombre_clave) equipoKeyMap[e.nombre_clave.toLowerCase()] = e.nombre;
    });
    const personsMap = {};
    persons.forEach((p) => {
      if (p.email && p.display_name) personsMap[p.email.toLowerCase()] = p.display_name;
    });

    function resolveName(email) {
      if (!email || email.trim() === "") return "—";
      const key = email.toLowerCase();
      const byEmail = equipoEmailMap[key];
      if (byEmail) return NAME_OVERRIDES[byEmail.toLowerCase()] || byEmail;
      const displayName = personsMap[key] || email;
      const resolved = equipoKeyMap[displayName.toLowerCase()] || displayName;
      return NAME_OVERRIDES[resolved.toLowerCase()] || resolved;
    }

    function resolveEpic(t) {
      if (!t.parent_key) return null;
      const parent = allTickets.find((p) => p.jira_key === t.parent_key);
      if (!parent) return null;
      if (parent.issue_type === "Epic") return parent;
      if (parent.parent_key) {
        const gp = allTickets.find((g) => g.jira_key === parent.parent_key);
        if (gp?.issue_type === "Epic") return gp;
      }
      return null;
    }

    function formatDate(d) {
      return new Date(d).toLocaleString("es-PE", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    }

    /* ═══════════════════════════════════════════════════════════════
       3. CONSTRUIR DATOS DE HOJAS
       ═══════════════════════════════════════════════════════════════ */
    // --- Datos "Osi" ---
    const headersOsi = [
      "Tipo", "Clave", "Resumen", "Subtareas", "Principal",
      "Épica", "Sprint", "Persona asignada", "Story Points",
      "Estado", "Informador", "Creada",
    ];
    const colWidthsOsi = [16, 13, 52, 20, 13, 32, 22, 24, 13, 20, 24, 18];

    const rowsOsi = allTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Subtareas: t.subtask_keys?.join(", ") || "",
      Principal: t.parent_key || "",
      "Épica": resolveEpic(t)?.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      "Story Points": t.story_points != null && t.story_points !== "" ? Number(t.story_points) : "",
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
      Creada: t.created_at ? formatDate(t.created_at) : "",
    }));

    // --- Datos "Datos QA" ---
    const headersQA = ["Tipo", "Clave", "Resumen", "Sprint", "Persona asignada", "Estado", "Informador"];
    const colWidthsQA = [16, 13, 52, 22, 24, 20, 24];
    const pf3qaTickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3QA-"));

    /* ═══════════════════════════════════════════════════════════════
       4. GENERAR XML DE LAS HOJAS CON INLINE STRINGS (sin sharedStrings)
       ═══════════════════════════════════════════════════════════════ */
    // Helper: convertir índice de columna a letra Excel (0→A, 1→B, ..., 25→Z, 26→AA)
    function colLetter(idx) {
      let s = "";
      let n = idx;
      while (n >= 0) {
        s = String.fromCharCode(65 + (n % 26)) + s;
        n = Math.floor(n / 26) - 1;
      }
      return s;
    }

    // Helper: generar XML de worksheet completo con inline strings
    function buildWorksheetXml(headers, rows, colWidths) {
      let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      xml += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';

      // Columnas con ancho personalizado
      if (colWidths.length > 0) {
        xml += "<cols>";
        colWidths.forEach((w, i) => {
          xml += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`;
        });
        xml += "</cols>";
      }

      xml += "<sheetData>";

      // Fila de encabezado
      xml += '<row r="1">';
      headers.forEach((h, c) => {
        xml += `<c r="${colLetter(c)}1" t="inlineStr"><is><t>${escXml(h)}</t></is></c>`;
      });
      xml += "</row>";

      // Filas de datos
      rows.forEach((row, ri) => {
        const r = ri + 2;
        xml += `<row r="${r}">`;
        headers.forEach((h, c) => {
          const ref = `${colLetter(c)}${r}`;
          const val = row[h];
          if (val === "" || val == null) {
            // Celda vacía con inline string vacío
            xml += `<c r="${ref}" t="inlineStr"><is><t></t></is></c>`;
          } else if (typeof val === "number") {
            xml += `<c r="${ref}"><v>${val}</v></c>`;
          } else {
            xml += `<c r="${ref}" t="inlineStr"><is><t>${escXml(String(val))}</t></is></c>`;
          }
        });
        xml += "</row>";
      });

      xml += "</sheetData>";

      // AutoFilter
      const lastCol = colLetter(headers.length - 1);
      const lastRow = rows.length + 1;
      xml += `<autoFilter ref="A1:${lastCol}${lastRow}"/>`;

      xml += "</worksheet>";
      return xml;
    }

    const osiSheetXml = buildWorksheetXml(headersOsi, rowsOsi, colWidthsOsi);
    const qaSheetXml = buildWorksheetXml(headersQA, pf3qaTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
    })), colWidthsQA);

    /* ═══════════════════════════════════════════════════════════════
       5. PIVOT TABLES QA (cache 2) - Definiciones mínimas con refreshOnLoad
       ═══════════════════════════════════════════════════════════════ */

    // Cache 2: usa refreshOnLoad para que Excel reconstruya desde "Datos QA"
    // No generamos records manuales — Excel los calcula al abrir
    const cacheDef2Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      'r:id="rId1" refreshOnLoad="1" refreshedBy="Sistema" refreshedDate="46098" ' +
      'createdVersion="8" refreshedVersion="8" minRefreshableVersion="3" recordCount="0">' +
      '<cacheSource type="worksheet"><worksheetSource ref="A1:G1048576" sheet="Datos QA"/></cacheSource>' +
      '<cacheFields count="7">' +
      '<cacheField name="Tipo" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      '<cacheField name="Clave" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      '<cacheField name="Resumen" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>' +
      '<cacheField name="Sprint" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      '<cacheField name="Persona asignada" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      '<cacheField name="Estado" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      '<cacheField name="Informador" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      "</cacheFields></pivotCacheDefinition>";

    const cacheRecords2Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" count="0"/>';

    // -- pivotTable4.xml (por Informador, azul) --
    // Campos: 0=Tipo(page), 1=Clave(data/count), 2=Resumen(-), 3=Sprint(page),
    //         4=Persona asignada(-), 5=Estado(col), 6=Informador(row)
    const pt4Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaQA_Informador" cacheId="1" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      '<location ref="A4:E6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>' +
      '<pivotFields count="7">' +
      '<pivotField axis="axisPage" showAll="0"/>' +
      '<pivotField dataField="1" showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField axis="axisPage" showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField axis="axisCol" showAll="0"/>' +
      '<pivotField axis="axisRow" showAll="0"/>' +
      '</pivotFields>' +
      '<rowFields count="1"><field x="6"/></rowFields>' +
      '<rowItems count="1"><i t="grand"><x/></i></rowItems>' +
      '<colFields count="1"><field x="5"/></colFields>' +
      '<colItems count="1"><i t="grand"><x/></i></colItems>' +
      '<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="3" hier="-1"/></pageFields>' +
      '<dataFields count="1"><dataField name="Informadores" fld="1" subtotal="count" baseField="0" baseItem="0"/></dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium2" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      '</pivotTableDefinition>';

    // -- pivotTable5.xml (por Asignado, azul) --
    const pt5Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaQA_Asignado" cacheId="1" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      '<location ref="I4:M6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>' +
      '<pivotFields count="7">' +
      '<pivotField axis="axisPage" showAll="0"/>' +
      '<pivotField dataField="1" showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField axis="axisPage" showAll="0"/>' +
      '<pivotField axis="axisRow" showAll="0"/>' +
      '<pivotField axis="axisCol" showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '</pivotFields>' +
      '<rowFields count="1"><field x="4"/></rowFields>' +
      '<rowItems count="1"><i t="grand"><x/></i></rowItems>' +
      '<colFields count="1"><field x="5"/></colFields>' +
      '<colItems count="1"><i t="grand"><x/></i></colItems>' +
      '<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="3" hier="-1"/></pageFields>' +
      '<dataFields count="1"><dataField name="Asignados" fld="1" subtotal="count" baseField="0" baseItem="0"/></dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium2" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      '</pivotTableDefinition>';

    /* ═══════════════════════════════════════════════════════════════
       6. CARGAR TEMPLATE E INYECTAR TODO
       ═══════════════════════════════════════════════════════════════ */
    const templateRes = await fetch("/templates/reporte_template.xlsx");
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    // Hojas de datos (inline strings, no reemplaza sharedStrings.xml del template)
    zip.file("xl/worksheets/sheet2.xml", osiSheetXml);    // Osi
    zip.file("xl/worksheets/sheet4.xml", qaSheetXml);     // Datos QA

    // Cache 1 (Osi) — NO se toca. El template tiene refreshOnLoad="1" que
    // reconstruye el cache automáticamente al abrir. Pivot tables 1, 2, 3
    // también se dejan intactas del template.

    // Cache 2 (Datos QA) — completo con records
    zip.file("xl/pivotCache/pivotCacheDefinition2.xml", cacheDef2Xml);
    zip.file("xl/pivotCache/pivotCacheRecords2.xml", cacheRecords2Xml);

    // Pivot tables QA dinámicas
    zip.file("xl/pivotTables/pivotTable4.xml", pt4Xml);
    zip.file("xl/pivotTables/pivotTable5.xml", pt5Xml);

    /* ═══════════════════════════════════════════════════════════════
       7. DESCARGAR
       ═══════════════════════════════════════════════════════════════ */
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toLocaleDateString("es-PE").replace(/\//g, "-");
    a.download = `Reporte_Jira_${selectedSprint ? selectedSprint.replace(/\s+/g, "_") : "Todos"}_${dateStr}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error("Error al exportar Excel:", err);
    alert("Error al generar el Excel. Ver consola para detalles.");
  }
}
