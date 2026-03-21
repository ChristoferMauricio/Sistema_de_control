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

import XLSX from "xlsx-js-style";
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
       1. OBTENER DATOS DE SUPABASE
       ═══════════════════════════════════════════════════════════════ */
    const [ticketsRes, equipoRes, personsRes] = await Promise.all([
      supabase.from("jira_tickets").select("*"),
      supabase.from("equipo_desarrollo").select("correo_pgim, correo_gcorp, nombre_clave, nombre"),
      supabase.from("jira_persons").select("email, display_name"),
    ]);

    const allTickets = ticketsRes.data || [];
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
       3. ESTILOS PARA HOJAS DE DATOS
       ═══════════════════════════════════════════════════════════════ */
    const thinBorder = { style: "thin", color: { rgb: "B4C6E7" } };
    const bdr = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

    // Encabezado Osi: azul oscuro
    const osiHdr = {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1F4E79" } },
      border: bdr,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    };
    // Encabezado Datos QA: azul medio
    const qaHdr = {
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "2E75B6" } },
      border: bdr,
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
    };
    // Celda de dato genérica
    const dataCell = {
      font: { sz: 10, color: { rgb: "1F2937" } },
      border: bdr,
      alignment: { vertical: "center", wrapText: true },
    };
    const dataCellCenter = { ...dataCell, alignment: { horizontal: "center", vertical: "center" } };
    // Celda clave (azul, link-like)
    const claveCell = {
      font: { sz: 10, color: { rgb: "1F4E79" }, bold: true },
      border: bdr,
      alignment: { vertical: "center" },
    };
    // Filas alternas
    const dataEven = {
      font: { sz: 10, color: { rgb: "1F2937" } },
      fill: { fgColor: { rgb: "D6E4F0" } },
      border: bdr,
      alignment: { vertical: "center", wrapText: true },
    };
    const dataEvenCenter = { ...dataEven, alignment: { horizontal: "center", vertical: "center" } };
    const claveEven = { ...claveCell, fill: { fgColor: { rgb: "D6E4F0" } } };

    /* ═══════════════════════════════════════════════════════════════
       4. CONSTRUIR HOJA "Osi" CON ESTILO
       ═══════════════════════════════════════════════════════════════ */
    const headersOsi = [
      "Tipo", "Clave", "Resumen", "Subtareas", "Principal",
      "Épica", "Sprint", "Persona asignada", "Story Points",
      "Estado", "Informador", "Creada",
    ];
    const osiHeaderRow = headersOsi.map((h) => ({ v: h, t: "s", s: osiHdr }));

    const osiDataRows = allTickets.map((t, i) => {
      const even = i % 2 === 1;
      const cs = even ? dataEven : dataCell;
      const cc = even ? dataEvenCenter : dataCellCenter;
      const ck = even ? claveEven : claveCell;
      const sp = t.story_points;
      return [
        { v: t.issue_type || "", t: "s", s: cc },
        { v: t.jira_key || "", t: "s", s: ck },
        { v: t.summary || "", t: "s", s: cs },
        { v: t.subtask_keys?.join(", ") || "", t: "s", s: cs },
        { v: t.parent_key || "", t: "s", s: cc },
        { v: resolveEpic(t)?.summary || "", t: "s", s: cs },
        { v: t.sprint || "", t: "s", s: cc },
        { v: resolveName(t.assignee_email), t: "s", s: cs },
        sp != null && sp !== "" ? { v: Number(sp), t: "n", s: cc } : { v: "", t: "s", s: cc },
        { v: t.status || "", t: "s", s: cc },
        { v: resolveName(t.reporter_email), t: "s", s: cs },
        { v: t.created_at ? formatDate(t.created_at) : "", t: "s", s: cc },
      ];
    });

    const wsOsi = XLSX.utils.aoa_to_sheet([osiHeaderRow, ...osiDataRows]);
    wsOsi["!cols"] = [
      { wch: 16 }, { wch: 13 }, { wch: 52 }, { wch: 20 }, { wch: 13 },
      { wch: 32 }, { wch: 22 }, { wch: 24 }, { wch: 13 }, { wch: 20 },
      { wch: 24 }, { wch: 18 },
    ];
    wsOsi["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: allTickets.length, c: 11 } }),
    };

    /* ═══════════════════════════════════════════════════════════════
       5. CONSTRUIR HOJA "Datos QA" CON ESTILO
       ═══════════════════════════════════════════════════════════════ */
    const headersQA = ["Tipo", "Clave", "Resumen", "Sprint", "Persona asignada", "Estado", "Informador"];
    const pf3qaTickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3QA-"));

    const qaHeaderRow = headersQA.map((h) => ({ v: h, t: "s", s: qaHdr }));
    const qaDataRows = pf3qaTickets.map((t, i) => {
      const even = i % 2 === 1;
      const cs = even ? dataEven : dataCell;
      const cc = even ? dataEvenCenter : dataCellCenter;
      const ck = even ? claveEven : claveCell;
      return [
        { v: t.issue_type || "", t: "s", s: cc },
        { v: t.jira_key || "", t: "s", s: ck },
        { v: t.summary || "", t: "s", s: cs },
        { v: t.sprint || "", t: "s", s: cc },
        { v: resolveName(t.assignee_email), t: "s", s: cs },
        { v: t.status || "", t: "s", s: cc },
        { v: resolveName(t.reporter_email), t: "s", s: cs },
      ];
    });

    const wsQA = XLSX.utils.aoa_to_sheet([qaHeaderRow, ...qaDataRows]);
    wsQA["!cols"] = [
      { wch: 16 }, { wch: 13 }, { wch: 52 }, { wch: 22 }, { wch: 24 }, { wch: 20 }, { wch: 24 },
    ];
    wsQA["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: pf3qaTickets.length, c: 6 } }),
    };

    /* ═══════════════════════════════════════════════════════════════
       6. GENERAR XML DE LAS HOJAS ESTILIZADAS
       ═══════════════════════════════════════════════════════════════ */
    const wbTemp = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbTemp, wsOsi, "Osi");
    XLSX.utils.book_append_sheet(wbTemp, wsQA, "DatosQA");
    const tempBuf = XLSX.write(wbTemp, { bookType: "xlsx", type: "array" });
    const tempZip = await JSZip.loadAsync(tempBuf);

    const osiSheetXml = await tempZip.file("xl/worksheets/sheet1.xml").async("string");
    const qaSheetXml = await tempZip.file("xl/worksheets/sheet2.xml").async("string");
    const sharedStrXml = await tempZip.file("xl/sharedStrings.xml")?.async("string");
    const stylesXml = await tempZip.file("xl/styles.xml")?.async("string");

    /* ═══════════════════════════════════════════════════════════════
       7. CONSTRUIR PIVOT CACHE 2 Y PIVOT TABLES DINÁMICAMENTE
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
       8. CARGAR TEMPLATE E INYECTAR TODO
       ═══════════════════════════════════════════════════════════════ */
    const templateRes = await fetch("/templates/reporte_template.xlsx");
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    // Hojas de datos estilizadas
    zip.file("xl/worksheets/sheet2.xml", osiSheetXml);    // Osi
    zip.file("xl/worksheets/sheet4.xml", qaSheetXml);     // Datos QA
    if (sharedStrXml) zip.file("xl/sharedStrings.xml", sharedStrXml);
    if (stylesXml) zip.file("xl/styles.xml", stylesXml);

    // Cache 1 (Osi) — refreshOnLoad + recordCount
    let cacheDef1 = await zip.file("xl/pivotCache/pivotCacheDefinition1.xml").async("string");
    if (!cacheDef1.includes("refreshOnLoad")) {
      cacheDef1 = cacheDef1.replace("<pivotCacheDefinition ", '<pivotCacheDefinition refreshOnLoad="1" ');
    }
    cacheDef1 = cacheDef1.replace(/recordCount="\d+"/, `recordCount="${allTickets.length}"`);
    zip.file("xl/pivotCache/pivotCacheDefinition1.xml", cacheDef1);

    // Cache 1 records vacíos (Excel reconstruye)
    zip.file(
      "xl/pivotCache/pivotCacheRecords1.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0"/>'
    );

    // Cache 2 (Datos QA) — completo con records
    zip.file("xl/pivotCache/pivotCacheDefinition2.xml", cacheDef2Xml);
    zip.file("xl/pivotCache/pivotCacheRecords2.xml", cacheRecords2Xml);

    // Pivot tables QA dinámicas
    zip.file("xl/pivotTables/pivotTable4.xml", pt4Xml);
    zip.file("xl/pivotTables/pivotTable5.xml", pt5Xml);

    /* ═══════════════════════════════════════════════════════════════
       9. DESCARGAR
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
