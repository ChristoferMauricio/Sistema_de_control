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
import { sortSprints } from "@/lib/utils";

const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

/** Escapa caracteres especiales XML */
function escXml(s) {
  return String(s || "")
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
       5. CONSTRUIR PIVOT CACHE 2 Y PIVOT TABLES DINÁMICAMENTE
       ═══════════════════════════════════════════════════════════════ */

    // Datos QA como objetos simples para construir el cache
    const rowsQA = pf3qaTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Sprint: t.sprint || "",
      Asignado: resolveName(t.assignee_email),
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
    }));

    // -- Extraer valores únicos para cada campo --
    const unique = (arr) => [...new Set(arr)];
    const tipos = unique(rowsQA.map((r) => r.Tipo).filter((v) => v && v !== "—"));
    const sprintsRaw = unique(rowsQA.map((r) => r.Sprint).filter(Boolean));
    const sprintsList = sortSprints(sprintsRaw);
    // Estado en orden deseado: Por hacer, En curso, Finalizada
    const estadoDesired = ["Por hacer", "Tareas por hacer", "En curso", "Finalizada"];
    const allEstados = unique(rowsQA.map((r) => r.Estado).filter(Boolean));
    const estados = [];
    estadoDesired.forEach((e) => {
      const found = allEstados.find((a) => a.toLowerCase() === e.toLowerCase());
      if (found && !estados.includes(found)) estados.push(found);
    });
    allEstados.forEach((e) => {
      if (!estados.some((s) => s.toLowerCase() === e.toLowerCase())) estados.push(e);
    });
    const asignados = unique(rowsQA.map((r) => r.Asignado).filter((v) => v && v !== "—")).sort();
    const informadores = unique(rowsQA.map((r) => r.Informador).filter((v) => v && v !== "—")).sort();

    // -- Detectar si hay blanks en cada campo --
    const hasBlank = (col) => rowsQA.some((r) => !r[col] || r[col] === "" || r[col] === "—");
    const tipoBlank = hasBlank("Tipo");
    const sprintBlank = hasBlank("Sprint");
    const estadoBlank = hasBlank("Estado");
    const asignadoBlank = hasBlank("Asignado");
    const informadorBlank = hasBlank("Informador");

    // -- Helper: construir sharedItems XML --
    function buildShared(vals, blank, extra = "") {
      const items = vals.map((v) => `<s v="${escXml(v)}"/>`).join("");
      const m = blank ? "<m/>" : "";
      const count = vals.length + (blank ? 1 : 0);
      const cb = blank ? ' containsBlank="1"' : "";
      return `<sharedItems${cb} count="${count}"${extra}>${items}${m}</sharedItems>`;
    }

    // -- Índice del sprint más actual (highest Tablero Sprint) --
    const highestSprint = [...sprintsList].reverse().find((s) => /Tablero\s+Sprint/i.test(s)) || sprintsList[sprintsList.length - 1] || "";
    const highestSprintIdx = sprintsList.indexOf(highestSprint);

    // -- Mapas de valor → índice para cache records --
    const idxMap = (vals, blank) => {
      const m = {};
      vals.forEach((v, i) => { m[v] = i; });
      if (blank) m[""] = vals.length;
      m["—"] = blank ? vals.length : vals.length; // map "—" to blank
      return m;
    };
    const tipoIdx = idxMap(tipos, tipoBlank);
    const sprintIdx = idxMap(sprintsList, sprintBlank);
    const estadoIdx = idxMap(estados, estadoBlank);
    const asignadoIdx = idxMap(asignados, asignadoBlank);
    const informadorIdx = idxMap(informadores, informadorBlank);

    // -- pivotCacheDefinition2.xml (SIN refreshOnLoad, records completos) --
    const cacheDef2Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      `r:id="rId1" refreshedBy="Sistema" refreshedDate="46098" ` +
      `createdVersion="8" refreshedVersion="8" minRefreshableVersion="3" recordCount="${rowsQA.length}">` +
      '<cacheSource type="worksheet"><worksheetSource ref="A1:G1048576" sheet="Datos QA"/></cacheSource>' +
      '<cacheFields count="7">' +
      `<cacheField name="Tipo" numFmtId="0">${buildShared(tipos, tipoBlank)}</cacheField>` +
      '<cacheField name="Clave" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      '<cacheField name="Resumen" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>' +
      `<cacheField name="Sprint" numFmtId="0">${buildShared(sprintsList, sprintBlank)}</cacheField>` +
      `<cacheField name="Persona asignada" numFmtId="0">${buildShared(asignados, asignadoBlank)}</cacheField>` +
      `<cacheField name="Estado" numFmtId="0">${buildShared(estados, estadoBlank)}</cacheField>` +
      `<cacheField name="Informador" numFmtId="0">${buildShared(informadores, informadorBlank)}</cacheField>` +
      "</cacheFields></pivotCacheDefinition>";

    // -- pivotCacheRecords2.xml (registros completos con índices) --
    const records = rowsQA
      .map((r) => {
        const ti = tipoIdx[r.Tipo] ?? (tipoBlank ? tipos.length : 0);
        const si = sprintIdx[r.Sprint] ?? (sprintBlank ? sprintsList.length : 0);
        const ai = asignadoIdx[r.Asignado] ?? (asignadoBlank ? asignados.length : 0);
        const ei = estadoIdx[r.Estado] ?? (estadoBlank ? estados.length : 0);
        const ii = informadorIdx[r.Informador] ?? (informadorBlank ? informadores.length : 0);
        return (
          "<r>" +
          `<x v="${ti}"/>` +
          `<s v="${escXml(r.Clave)}"/>` +
          `<s v="${escXml(r.Resumen)}"/>` +
          `<x v="${si}"/>` +
          `<x v="${ai}"/>` +
          `<x v="${ei}"/>` +
          `<x v="${ii}"/>` +
          "</r>"
        );
      })
      .join("");
    const cacheRecords2Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${rowsQA.length}">` +
      records +
      "</pivotCacheRecords>";

    // -- Helper: generar items XML para un campo --
    // visible = Set de índices que deben ser visibles, null = todos visibles
    function buildItems(count, hiddenSet) {
      let xml = "";
      for (let i = 0; i < count; i++) {
        xml += hiddenSet && hiddenSet.has(i) ? `<item h="1" x="${i}"/>` : `<item x="${i}"/>`;
      }
      xml += '<item t="default"/>';
      return `<items count="${count + 1}">${xml}</items>`;
    }

    // -- Tipo: mostrar solo Historia y Error, ocultar el resto --
    const tipoTotal = tipos.length + (tipoBlank ? 1 : 0);
    const tipoHidden = new Set();
    for (let i = 0; i < tipoTotal; i++) {
      const val = i < tipos.length ? tipos[i] : "";
      if (val !== "Historia" && val !== "Error") tipoHidden.add(i);
    }
    const tipoMultiSelect = tipoHidden.size > 0;

    // -- Sprint items: todos visibles, selección vía pageField item --
    const sprintTotal = sprintsList.length + (sprintBlank ? 1 : 0);

    // -- Estado items: todos en orden, ocultar blank si existe --
    const estadoTotal = estados.length + (estadoBlank ? 1 : 0);
    const estadoHidden = new Set();
    if (estadoBlank) estadoHidden.add(estados.length);

    // -- Asignado/Informador items --
    const asignadoTotal = asignados.length + (asignadoBlank ? 1 : 0);
    const asignadoHidden = new Set();
    if (asignadoBlank) asignadoHidden.add(asignados.length);
    const informadorTotal = informadores.length + (informadorBlank ? 1 : 0);
    const informadorHidden = new Set();
    if (informadorBlank) informadorHidden.add(informadores.length);

    // -- Buscar el item index del sprint seleccionado en la lista de items --
    // pageField item= es el índice en <items>, que coincide con x=
    const sprintPageItem = highestSprintIdx >= 0 ? highestSprintIdx : 0;

    // -- pivotTable4.xml (por Informador, posición A4, azul) --
    // Campos: 0=Tipo(page), 1=Clave(data/count), 2=Resumen(-), 3=Sprint(page), 4=Asignado(-), 5=Estado(col), 6=Informador(row)
    const pt4Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaQA_Informador" cacheId="1" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      `<location ref="A4:E6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>` +
      '<pivotFields count="7">' +
      // Field 0: Tipo (page, multi-select Historia+Error)
      `<pivotField axis="axisPage"${tipoMultiSelect ? ' multipleItemSelectionAllowed="1"' : ""} showAll="0">${buildItems(tipoTotal, tipoHidden)}</pivotField>` +
      // Field 1: Clave (data field = count)
      '<pivotField dataField="1" showAll="0"/>' +
      // Field 2: Resumen (unused)
      '<pivotField showAll="0"/>' +
      // Field 3: Sprint (page, single select)
      `<pivotField axis="axisPage" showAll="0">${buildItems(sprintTotal, null)}</pivotField>` +
      // Field 4: Asignado (unused in this table)
      '<pivotField showAll="0"/>' +
      // Field 5: Estado (col axis)
      `<pivotField axis="axisCol" showAll="0">${buildItems(estadoTotal, estadoHidden)}</pivotField>` +
      // Field 6: Informador (row axis)
      `<pivotField axis="axisRow" showAll="0">${buildItems(informadorTotal, informadorHidden)}</pivotField>` +
      "</pivotFields>" +
      '<rowFields count="1"><field x="6"/></rowFields>' +
      `<rowItems count="1"><i t="grand"><x/></i></rowItems>` +
      '<colFields count="1"><field x="5"/></colFields>' +
      `<colItems count="1"><i t="grand"><x/></i></colItems>` +
      `<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="3" item="${sprintPageItem}" hier="-1"/></pageFields>` +
      '<dataFields count="1"><dataField name="Informadores" fld="1" subtotal="count" baseField="0" baseItem="0"/></dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium2" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      "</pivotTableDefinition>";

    // -- pivotTable5.xml (por Asignado, posición I4, azul) --
    // Campos: 0=Tipo(page), 1=Clave(data/count), 2=Resumen(-), 3=Sprint(page), 4=Asignado(row), 5=Estado(col), 6=Informador(-)
    const pt5Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaQA_Asignado" cacheId="1" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      `<location ref="I4:M6" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>` +
      '<pivotFields count="7">' +
      // Field 0: Tipo (page, multi-select Historia+Error)
      `<pivotField axis="axisPage"${tipoMultiSelect ? ' multipleItemSelectionAllowed="1"' : ""} showAll="0">${buildItems(tipoTotal, tipoHidden)}</pivotField>` +
      // Field 1: Clave (data field = count)
      '<pivotField dataField="1" showAll="0"/>' +
      // Field 2: Resumen (unused)
      '<pivotField showAll="0"/>' +
      // Field 3: Sprint (page, single select)
      `<pivotField axis="axisPage" showAll="0">${buildItems(sprintTotal, null)}</pivotField>` +
      // Field 4: Asignado (row axis)
      `<pivotField axis="axisRow" showAll="0">${buildItems(asignadoTotal, asignadoHidden)}</pivotField>` +
      // Field 5: Estado (col axis)
      `<pivotField axis="axisCol" showAll="0">${buildItems(estadoTotal, estadoHidden)}</pivotField>` +
      // Field 6: Informador (unused in this table)
      '<pivotField showAll="0"/>' +
      "</pivotFields>" +
      '<rowFields count="1"><field x="4"/></rowFields>' +
      `<rowItems count="1"><i t="grand"><x/></i></rowItems>` +
      '<colFields count="1"><field x="5"/></colFields>' +
      `<colItems count="1"><i t="grand"><x/></i></colItems>` +
      `<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="3" item="${sprintPageItem}" hier="-1"/></pageFields>` +
      '<dataFields count="1"><dataField name="Asignados" fld="1" subtotal="count" baseField="0" baseItem="0"/></dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium2" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      "</pivotTableDefinition>";

    /* ═══════════════════════════════════════════════════════════════
       6. CARGAR TEMPLATE E INYECTAR TODO
       ═══════════════════════════════════════════════════════════════ */
    const templateRes = await fetch("/templates/reporte_template.xlsx");
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    // Hojas de datos (inline strings, no reemplaza sharedStrings.xml del template)
    zip.file("xl/worksheets/sheet2.xml", osiSheetXml);    // Osi
    zip.file("xl/worksheets/sheet4.xml", qaSheetXml);     // Datos QA

    // Cache 1 (Osi) — records completos para que pivots se muestren sin refresh manual
    // Campos Osi: 0=Tipo, 1=Clave, 2=Resumen, 3=Subtareas, 4=Principal,
    //             5=Épica, 6=Sprint, 7=Persona asignada, 8=Story Points,
    //             9=Estado, 10=Informador, 11=Creada

    // Extraer valores únicos para campos indexados
    const c1Tipos = unique(rowsOsi.map((r) => r.Tipo).filter(Boolean));
    const c1Sprints = sortSprints(unique(rowsOsi.map((r) => r.Sprint).filter(Boolean)));
    const c1Asignados = unique(rowsOsi.map((r) => r["Persona asignada"]).filter((v) => v && v !== "—")).sort();
    const c1Estados = unique(rowsOsi.map((r) => r.Estado).filter(Boolean));
    const c1Informadores = unique(rowsOsi.map((r) => r.Informador).filter((v) => v && v !== "—")).sort();
    const c1Epicas = unique(rowsOsi.map((r) => r["Épica"]).filter(Boolean));

    const c1TipoBlank = rowsOsi.some((r) => !r.Tipo);
    const c1SprintBlank = rowsOsi.some((r) => !r.Sprint);
    const c1AsignadoBlank = rowsOsi.some((r) => !r["Persona asignada"] || r["Persona asignada"] === "—");
    const c1EstadoBlank = rowsOsi.some((r) => !r.Estado);
    const c1InformadorBlank = rowsOsi.some((r) => !r.Informador || r.Informador === "—");
    const c1EpicaBlank = rowsOsi.some((r) => !r["Épica"]);

    // Mapas de índice
    const c1TipoIdx = idxMap(c1Tipos, c1TipoBlank);
    const c1SprintIdx = idxMap(c1Sprints, c1SprintBlank);
    const c1AsignadoIdx = idxMap(c1Asignados, c1AsignadoBlank);
    const c1EstadoIdx = idxMap(c1Estados, c1EstadoBlank);
    const c1InformadorIdx = idxMap(c1Informadores, c1InformadorBlank);
    const c1EpicaIdx = idxMap(c1Epicas, c1EpicaBlank);

    // Story Points: detectar si hay números y/o blanks
    const spHasNum = rowsOsi.some((r) => r["Story Points"] !== "" && r["Story Points"] != null);
    const spHasBlank = rowsOsi.some((r) => r["Story Points"] === "" || r["Story Points"] == null);
    const spValues = unique(rowsOsi.map((r) => r["Story Points"]).filter((v) => v !== "" && v != null));
    const spMin = spValues.length > 0 ? Math.min(...spValues) : 0;
    const spMax = spValues.length > 0 ? Math.max(...spValues) : 0;

    // Cache definition 1
    const cacheDef1Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
      `r:id="rId1" refreshedBy="Sistema" refreshedDate="46098" ` +
      `createdVersion="8" refreshedVersion="8" minRefreshableVersion="3" recordCount="${rowsOsi.length}">` +
      '<cacheSource type="worksheet"><worksheetSource ref="A1:L1048576" sheet="Osi"/></cacheSource>' +
      '<cacheFields count="12">' +
      `<cacheField name="Tipo" numFmtId="0">${buildShared(c1Tipos, c1TipoBlank)}</cacheField>` +
      '<cacheField name="Clave" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      '<cacheField name="Resumen" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>' +
      '<cacheField name="Subtareas" numFmtId="0"><sharedItems containsBlank="1" longText="1"/></cacheField>' +
      '<cacheField name="Principal" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      `<cacheField name="Épica" numFmtId="0">${buildShared(c1Epicas, c1EpicaBlank)}</cacheField>` +
      `<cacheField name="Sprint" numFmtId="0">${buildShared(c1Sprints, c1SprintBlank)}</cacheField>` +
      `<cacheField name="Persona asignada" numFmtId="0">${buildShared(c1Asignados, c1AsignadoBlank)}</cacheField>` +
      `<cacheField name="Story Points" numFmtId="0"><sharedItems containsSemiMixedTypes="0" containsString="0"${spHasNum ? ' containsNumber="1"' : ""}${spHasBlank ? ' containsBlank="1"' : ""} minValue="${spMin}" maxValue="${spMax}"/></cacheField>` +
      `<cacheField name="Estado" numFmtId="0">${buildShared(c1Estados, c1EstadoBlank)}</cacheField>` +
      `<cacheField name="Informador" numFmtId="0">${buildShared(c1Informadores, c1InformadorBlank)}</cacheField>` +
      '<cacheField name="Creada" numFmtId="0"><sharedItems containsBlank="1"/></cacheField>' +
      "</cacheFields></pivotCacheDefinition>";

    // Cache records 1
    const c1Records = rowsOsi
      .map((r) => {
        const ti = c1TipoIdx[r.Tipo] ?? (c1TipoBlank ? c1Tipos.length : 0);
        const si = c1SprintIdx[r.Sprint] ?? (c1SprintBlank ? c1Sprints.length : 0);
        const ai = c1AsignadoIdx[r["Persona asignada"]] ?? (c1AsignadoBlank ? c1Asignados.length : 0);
        const ei = c1EstadoIdx[r.Estado] ?? (c1EstadoBlank ? c1Estados.length : 0);
        const ii = c1InformadorIdx[r.Informador] ?? (c1InformadorBlank ? c1Informadores.length : 0);
        const epi = c1EpicaIdx[r["Épica"]] ?? (c1EpicaBlank ? c1Epicas.length : 0);
        const sp = r["Story Points"];
        const spXml = sp !== "" && sp != null ? `<n v="${sp}"/>` : "<m/>";
        return (
          "<r>" +
          `<x v="${ti}"/>` +
          `<s v="${escXml(r.Clave)}"/>` +
          `<s v="${escXml(r.Resumen)}"/>` +
          `<s v="${escXml(r.Subtareas)}"/>` +
          `<s v="${escXml(r.Principal)}"/>` +
          `<x v="${epi}"/>` +
          `<x v="${si}"/>` +
          `<x v="${ai}"/>` +
          spXml +
          `<x v="${ei}"/>` +
          `<x v="${ii}"/>` +
          `<s v="${escXml(r.Creada)}"/>` +
          "</r>"
        );
      })
      .join("");
    const cacheRecords1Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      `<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${rowsOsi.length}">` +
      c1Records +
      "</pivotCacheRecords>";

    zip.file("xl/pivotCache/pivotCacheDefinition1.xml", cacheDef1Xml);
    zip.file("xl/pivotCache/pivotCacheRecords1.xml", cacheRecords1Xml);

    // -- Pivot Tables 1, 2, 3 (dinámicas, ajustadas al cache 1 actual) --
    // Índices para filtros de página
    const c1TipoTotal = c1Tipos.length + (c1TipoBlank ? 1 : 0);
    const c1SprintTotal = c1Sprints.length + (c1SprintBlank ? 1 : 0);
    const c1AsignadoTotal = c1Asignados.length + (c1AsignadoBlank ? 1 : 0);
    const c1EstadoTotal = c1Estados.length + (c1EstadoBlank ? 1 : 0);
    const c1EpicaTotal = c1Epicas.length + (c1EpicaBlank ? 1 : 0);
    const c1InformadorTotal = c1Informadores.length + (c1InformadorBlank ? 1 : 0);

    // Filtro Tipo: mostrar solo "Historia"
    const c1TipoHidden = new Set();
    for (let i = 0; i < c1TipoTotal; i++) {
      const val = i < c1Tipos.length ? c1Tipos[i] : "";
      if (val !== "Historia") c1TipoHidden.add(i);
    }
    const c1TipoMulti = c1TipoHidden.size > 0;

    // Sprint más actual de Osi (para filtro de página)
    const c1HighestSprint = [...c1Sprints].reverse().find((s) => /Iteracion|Tablero/i.test(s)) || c1Sprints[c1Sprints.length - 1] || "";
    const c1SprintPageItem = c1Sprints.indexOf(c1HighestSprint);

    // Ocultar blanks en estado y asignado
    const c1EstadoHidden = new Set();
    if (c1EstadoBlank) c1EstadoHidden.add(c1Estados.length);
    const c1AsignadoHidden = new Set();
    if (c1AsignadoBlank) c1AsignadoHidden.add(c1Asignados.length);

    // --- pivotTable1: Cuenta de Historias por Persona y Estado ---
    // Campos: 0=Tipo(page), 1=Clave(data/count), 2=Resumen(-), 3=Subtareas(-), 4=Principal(-),
    //         5=Épica(-), 6=Sprint(page), 7=Persona asignada(row), 8=SP(-), 9=Estado(col), 10=Informador(-), 11=Creada(-)
    const c1Pt1Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaDinamica2" cacheId="0" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      '<location ref="A4:F14" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>' +
      '<pivotFields count="12">' +
      `<pivotField axis="axisPage"${c1TipoMulti ? ' multipleItemSelectionAllowed="1"' : ""} showAll="0">${buildItems(c1TipoTotal, c1TipoHidden)}</pivotField>` +
      '<pivotField dataField="1" showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      `<pivotField axis="axisPage" showAll="0">${buildItems(c1SprintTotal, null)}</pivotField>` +
      `<pivotField axis="axisRow" showAll="0">${buildItems(c1AsignadoTotal, c1AsignadoHidden)}</pivotField>` +
      '<pivotField showAll="0"/>' +
      `<pivotField axis="axisCol" showAll="0">${buildItems(c1EstadoTotal, c1EstadoHidden)}</pivotField>` +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      "</pivotFields>" +
      '<rowFields count="1"><field x="7"/></rowFields>' +
      '<rowItems count="1"><i t="grand"><x/></i></rowItems>' +
      '<colFields count="1"><field x="9"/></colFields>' +
      '<colItems count="1"><i t="grand"><x/></i></colItems>' +
      `<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="6" item="${c1SprintPageItem >= 0 ? c1SprintPageItem : 0}" hier="-1"/></pageFields>` +
      '<dataFields count="1"><dataField name="Cuenta de Clave" fld="1" subtotal="count" baseField="0" baseItem="0"/></dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium4" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      "</pivotTableDefinition>";

    // --- pivotTable2: Suma de Story Points por Persona y Estado ---
    const c1Pt2Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaDinamica3" cacheId="0" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      '<location ref="I4:N14" firstHeaderRow="1" firstDataRow="2" firstDataCol="1" rowPageCount="2" colPageCount="1"/>' +
      '<pivotFields count="12">' +
      `<pivotField axis="axisPage"${c1TipoMulti ? ' multipleItemSelectionAllowed="1"' : ""} showAll="0">${buildItems(c1TipoTotal, c1TipoHidden)}</pivotField>` +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      `<pivotField axis="axisPage" showAll="0">${buildItems(c1SprintTotal, null)}</pivotField>` +
      `<pivotField axis="axisRow" showAll="0">${buildItems(c1AsignadoTotal, c1AsignadoHidden)}</pivotField>` +
      '<pivotField dataField="1" showAll="0"/>' +
      `<pivotField axis="axisCol" showAll="0">${buildItems(c1EstadoTotal, c1EstadoHidden)}</pivotField>` +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      "</pivotFields>" +
      '<rowFields count="1"><field x="7"/></rowFields>' +
      '<rowItems count="1"><i t="grand"><x/></i></rowItems>' +
      '<colFields count="1"><field x="9"/></colFields>' +
      '<colItems count="1"><i t="grand"><x/></i></colItems>' +
      `<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="6" item="${c1SprintPageItem >= 0 ? c1SprintPageItem : 0}" hier="-1"/></pageFields>` +
      '<dataFields count="1"><dataField name="Suma de Story Points" fld="8" subtotal="sum" baseField="0" baseItem="0"/></dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium4" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      "</pivotTableDefinition>";

    // --- pivotTable3: Reporte por Épica (HU count + SP sum) ---
    // Campos: 0=Tipo(page), 5=Épica(row), 6=Sprint(page), 8=SP(data/sum), 9=Estado(data/count)
    const c1Pt3Xml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'name="TablaEpica" cacheId="0" ' +
      'applyNumberFormats="0" applyBorderFormats="0" applyFontFormats="0" applyPatternFormats="0" ' +
      'applyAlignmentFormats="0" applyWidthHeightFormats="1" dataCaption="Valores" ' +
      'updatedVersion="8" minRefreshableVersion="3" useAutoFormatting="1" itemPrintTitles="1" ' +
      'createdVersion="8" indent="0" outline="1" outlineData="1" multipleFieldFilters="0">' +
      '<location ref="A4:C50" firstHeaderRow="0" firstDataRow="1" firstDataCol="1" rowPageCount="2" colPageCount="1"/>' +
      '<pivotFields count="12">' +
      `<pivotField axis="axisPage"${c1TipoMulti ? ' multipleItemSelectionAllowed="1"' : ""} showAll="0">${buildItems(c1TipoTotal, c1TipoHidden)}</pivotField>` +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      `<pivotField axis="axisRow" showAll="0">${buildItems(c1EpicaTotal, null)}</pivotField>` +
      `<pivotField axis="axisPage" showAll="0">${buildItems(c1SprintTotal, null)}</pivotField>` +
      '<pivotField showAll="0"/>' +
      '<pivotField dataField="1" showAll="0"/>' +
      '<pivotField dataField="1" showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      '<pivotField showAll="0"/>' +
      "</pivotFields>" +
      '<rowFields count="1"><field x="5"/></rowFields>' +
      '<rowItems count="1"><i t="grand"><x/></i></rowItems>' +
      '<colFields count="1"><field x="-2"/></colFields>' +
      '<colItems count="2"><i><x/></i><i i="1"><x v="1"/></i></colItems>' +
      `<pageFields count="2"><pageField fld="0" hier="-1"/><pageField fld="6" item="${c1SprintPageItem >= 0 ? c1SprintPageItem : 0}" hier="-1"/></pageFields>` +
      '<dataFields count="2">' +
      '<dataField name="HU" fld="9" subtotal="count" baseField="0" baseItem="0"/>' +
      '<dataField name="Puntos" fld="8" subtotal="sum" baseField="0" baseItem="0"/>' +
      '</dataFields>' +
      '<pivotTableStyleInfo name="PivotStyleMedium4" showRowHeaders="1" showColHeaders="1" showRowStripes="0" showColStripes="0" showLastColumn="1"/>' +
      "</pivotTableDefinition>";

    zip.file("xl/pivotTables/pivotTable1.xml", c1Pt1Xml);
    zip.file("xl/pivotTables/pivotTable2.xml", c1Pt2Xml);
    zip.file("xl/pivotTables/pivotTable3.xml", c1Pt3Xml);

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
