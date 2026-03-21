/**
 * @file lib/exportExcel.js - Módulo compartido de exportación a Excel
 * @description Genera un Excel unificado con:
 *   - Hoja "Osi": datos crudos de TODOS los tickets (fuente de tablas dinámicas existentes)
 *   - Hoja "Tabla dinámica": pivot por Persona/Estado (del template)
 *   - Hoja "Reporte por Épica": pivot por Épica (del template)
 *   - Hoja "Datos QA": datos crudos de tickets PF3QA (fuente de tablas dinámicas QA)
 *   - Hoja "Reporte QA": 2 tablas dinámicas (por Informador y por Asignado)
 *
 * Usado por: ReportesTable.js y errores-estadisticas/page.js
 */

import XLSX from "xlsx-js-style";
import JSZip from "jszip";
import { supabase } from "@/lib/supabase";

const NAME_OVERRIDES = { "miguel castillo": "Supervisor de Servicio" };

/**
 * Exporta un Excel unificado con todos los datos y tablas dinámicas.
 * Obtiene los datos directamente de Supabase para ser autosuficiente.
 *
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

    // Mapas de resolución de nombres
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
        const grandparent = allTickets.find((g) => g.jira_key === parent.parent_key);
        if (grandparent?.issue_type === "Epic") return grandparent;
      }
      return null;
    }

    function formatDate(d) {
      return new Date(d).toLocaleString("es-PE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }

    /* ═══════════════════════════════════════════════════════════════
       3. CONSTRUIR DATOS DE LA HOJA "Osi" (TODOS los tickets)
       ═══════════════════════════════════════════════════════════════ */
    const headersOsi = [
      "Tipo", "Clave", "Resumen", "Subtareas", "Principal",
      "Épica", "Sprint", "Persona asignada", "Story Points",
      "Estado", "Informador", "Creada",
    ];
    const rowsOsi = allTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Subtareas: t.subtask_keys?.join(", ") || "",
      Principal: t.parent_key || "",
      "Épica": resolveEpic(t)?.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      "Story Points": t.story_points ?? "",
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
      Creada: t.created_at ? formatDate(t.created_at) : "",
    }));

    /* ═══════════════════════════════════════════════════════════════
       4. CONSTRUIR DATOS DE LA HOJA "Datos QA" (solo PF3QA)
       ═══════════════════════════════════════════════════════════════ */
    const headersQA = [
      "Tipo", "Clave", "Resumen", "Sprint",
      "Persona asignada", "Estado", "Informador",
    ];
    const pf3qaTickets = allTickets.filter((t) => t.jira_key?.startsWith("PF3QA-"));
    const rowsQA = pf3qaTickets.map((t) => ({
      Tipo: t.issue_type || "",
      Clave: t.jira_key || "",
      Resumen: t.summary || "",
      Sprint: t.sprint || "",
      "Persona asignada": resolveName(t.assignee_email),
      Estado: t.status || "",
      Informador: resolveName(t.reporter_email),
    }));

    /* ═══════════════════════════════════════════════════════════════
       5. GENERAR XML DE AMBAS HOJAS DE DATOS
       ═══════════════════════════════════════════════════════════════ */
    // Crear un workbook temporal con las dos hojas para extraer su XML
    const wsOsi = XLSX.utils.json_to_sheet(rowsOsi, { header: headersOsi });
    const wsQA = XLSX.utils.json_to_sheet(rowsQA, { header: headersQA });
    const wbTemp = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wbTemp, wsOsi, "Osi");
    XLSX.utils.book_append_sheet(wbTemp, wsQA, "DatosQA");
    const tempBuf = XLSX.write(wbTemp, { bookType: "xlsx", type: "array" });
    const tempZip = await JSZip.loadAsync(tempBuf);

    const osiSheetXml = await tempZip.file("xl/worksheets/sheet1.xml").async("string");
    const qaSheetXml = await tempZip.file("xl/worksheets/sheet2.xml").async("string");
    const sharedStrFile = tempZip.file("xl/sharedStrings.xml");
    const sharedStrXml = sharedStrFile ? await sharedStrFile.async("string") : null;

    /* ═══════════════════════════════════════════════════════════════
       6. CARGAR TEMPLATE E INYECTAR DATOS
       ═══════════════════════════════════════════════════════════════ */
    const templateRes = await fetch("/templates/reporte_template.xlsx");
    const templateBuf = await templateRes.arrayBuffer();
    const zip = await JSZip.loadAsync(templateBuf);

    // Reemplazar hojas de datos
    zip.file("xl/worksheets/sheet2.xml", osiSheetXml);   // Osi
    zip.file("xl/worksheets/sheet4.xml", qaSheetXml);    // Datos QA
    if (sharedStrXml) {
      zip.file("xl/sharedStrings.xml", sharedStrXml);
    }

    /* ═══════════════════════════════════════════════════════════════
       7. PARCHEAR PIVOT CACHES
       ═══════════════════════════════════════════════════════════════ */
    // Cache 1 (Osi) — refreshOnLoad + recordCount
    let cacheDef1 = await zip.file("xl/pivotCache/pivotCacheDefinition1.xml").async("string");
    if (!cacheDef1.includes("refreshOnLoad")) {
      cacheDef1 = cacheDef1.replace("<pivotCacheDefinition ", '<pivotCacheDefinition refreshOnLoad="1" ');
    }
    cacheDef1 = cacheDef1.replace(/recordCount="\d+"/, `recordCount="${rowsOsi.length}"`);
    zip.file("xl/pivotCache/pivotCacheDefinition1.xml", cacheDef1);

    // Cache 2 (Datos QA) — recordCount
    let cacheDef2 = await zip.file("xl/pivotCache/pivotCacheDefinition2.xml").async("string");
    cacheDef2 = cacheDef2.replace(/recordCount="\d+"/, `recordCount="${rowsQA.length}"`);
    zip.file("xl/pivotCache/pivotCacheDefinition2.xml", cacheDef2);

    // Vaciar ambos cache records (Excel los reconstruye con refreshOnLoad=1)
    const emptyRecords =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0"/>';
    zip.file("xl/pivotCache/pivotCacheRecords1.xml", emptyRecords);
    zip.file("xl/pivotCache/pivotCacheRecords2.xml", emptyRecords);

    /* ═══════════════════════════════════════════════════════════════
       8. DESCARGAR
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
