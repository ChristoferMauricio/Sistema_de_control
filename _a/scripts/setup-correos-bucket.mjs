/**
 * @file setup-correos-bucket.mjs
 * @description Crea el bucket público "correos-pendientes" en Supabase Storage,
 *              usado por el módulo "Correos pendientes" para almacenar las
 *              imágenes pegadas/subidas en los recuadros del tablero.
 *
 *              Se ejecuta UNA sola vez: node scripts/setup-correos-bucket.mjs
 *              (idempotente: si el bucket ya existe, no hace nada)
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Leer credenciales desde .env.local (raíz del proyecto)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const getVar = (name) => env.match(new RegExp(`^${name}=(.+)$`, "m"))?.[1]?.trim();

const supabase = createClient(getVar("NEXT_PUBLIC_SUPABASE_URL"), getVar("SUPABASE_SERVICE_ROLE_KEY"));

const BUCKET = "correos-pendientes";

const { data: buckets, error: listError } = await supabase.storage.listBuckets();
if (listError) {
  console.error("Error listando buckets:", listError.message);
  process.exit(1);
}

if (buckets.some((b) => b.name === BUCKET)) {
  console.log(`El bucket "${BUCKET}" ya existe. Nada que hacer.`);
} else {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true, // URLs públicas para mostrar las imágenes con <img>
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp"],
  });
  if (error) {
    console.error("Error creando bucket:", error.message);
    process.exit(1);
  }
  console.log(`Bucket "${BUCKET}" creado correctamente (público, límite 10MB, solo imágenes).`);
}
