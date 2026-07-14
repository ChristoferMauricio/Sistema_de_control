/**
 * Archivo: app/api/import-hu-reportadas/route.js
 * Descripcion: API Route de Next.js para importar las historias reportadas desde el archivo Excel a Supabase.
 */

import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import path from "path";
import fs from "fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const excelPath = path.resolve("d:/OneDrive_UNI/OneDrive - UNIVERSIDAD NACIONAL DE INGENIERIA/Desktop/PGIM/_SISTEMA/Sistema_de_control/Historias reportadas.xlsx");

export async function POST() {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return Response.json({ error: "Credenciales de Supabase incompletas en el servidor" }, { status: 500 });
    }

    if (!fs.existsSync(excelPath)) {
      return Response.json({ error: `Archivo Excel no encontrado en: ${excelPath}` }, { status: 404 });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rawData.length <= 1) {
      return Response.json({ success: true, count: 0, message: "El Excel no contiene registros de datos" });
    }

    const rows = [];
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const epic_key = row[0] ? String(row[0]).trim() : null;
      const epic_summary = row[1] ? String(row[1]).trim() : null;
      const story_key = row[2] ? String(row[2]).trim() : null;
      const story_summary = row[3] ? String(row[3]).trim() : null;
      const story_points = row[4] != null && row[4] !== "" ? Number(row[4]) : null;
      const sprint = row[5] ? String(row[5]).trim() : null;
      const nota = row[6] ? String(row[6]).trim() : null;

      if (!story_key) continue;

      rows.push({
        epic_key,
        epic_summary,
        story_key,
        story_summary,
        story_points,
        sprint,
        nota
      });
    }

    // Insert in batches of 100
    const batchSize = 100;
    let successCount = 0;

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabaseAdmin
        .from("hu_reportadas")
        .upsert(batch, { onConflict: "story_key" });

      if (error) {
        return Response.json({ error: `Error al subir lote en Supabase: ${error.message}` }, { status: 500 });
      }

      successCount += batch.length;
    }

    return Response.json({
      success: true,
      count: successCount,
      message: `Se importaron ${successCount} historias correctamente.`
    });

  } catch (err) {
    console.error("Error en import-hu-reportadas API:", err);
    return Response.json({ error: `Error inesperado: ${err.message}` }, { status: 500 });
  }
}
