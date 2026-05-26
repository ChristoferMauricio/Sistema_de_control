import { NextResponse } from "next/server";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";

/**
 * Helper to call Gemini Vision API for transcribing/describing images.
 * Leverages gemini-1.5-flash which is multimodal and extremely fast.
 */
async function extractTextFromImage(buffer, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY.");
  }

  const base64Data = buffer.toString("base64");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: "Actúa como un OCR experto. Transcribe todo el texto legible de esta imagen a formato Markdown limpio en español. Si la imagen contiene diagramas, esquemas o gráficas, describe su flujo, estructura y datos de forma detallada y ordenada.",
            },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error en Gemini Vision API: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) {
    throw new Error("Gemini Vision no retornó una transcripción de texto válida.");
  }

  return text;
}

/**
 * Fast XML parser to extract text from Word document.xml.
 * Eliminates the need for external mammoth npm package.
 */
async function extractTextFromDocx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const docXmlFile = zip.file("word/document.xml");
  
  if (!docXmlFile) {
    throw new Error("El archivo .docx no contiene un documento de Word válido.");
  }

  const xmlText = await docXmlFile.async("string");
  
  // Extract paragraphs (<w:p>...</w:p>) and text runs (<w:t>...</w:t>)
  const paragraphs = [];
  const pRegex = /<w:p\b[^>]*>(.*?)<\/w:p>/g;
  const tRegex = /<w:t\b[^>]*>(.*?)<\/w:t>/g;
  
  let pMatch;
  while ((pMatch = pRegex.exec(xmlText)) !== null) {
    const pContent = pMatch[1];
    const runs = [];
    let tMatch;
    while ((tMatch = tRegex.exec(pContent)) !== null) {
      runs.push(tMatch[1]);
    }
    if (runs.length > 0) {
      paragraphs.push(runs.join(""));
    }
  }
  
  return paragraphs.join("\n\n");
}

/**
 * @file api/rag/extract-text/route.js
 * @description Endpoint serverless que recibe un archivo binario a través de FormData,
 *              determina su formato y extrae su texto plano de forma rápida
 *              (PDF, Word, Imágenes o Texto Puro).
 */
export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó ningún archivo en el cuerpo 'file'." },
        { status: 400 }
      );
    }

    const fileName = file.name || "documento_desconocido";
    const mimeType = file.type || "application/octet-stream";
    const fileBuffer = Buffer.from(await file.arrayBuffer());

    console.log(`[Text Extraction] Procesando archivo '${fileName}' (${mimeType}), tamaño: ${fileBuffer.length} bytes...`);

    let extractedText = "";

    // 1. Clasificar y parsear según el tipo MIME
    if (mimeType.startsWith("image/")) {
      // Usar Gemini Vision API para transcribir y describir la imagen
      extractedText = await extractTextFromImage(fileBuffer, mimeType);
    } 
    else if (mimeType === "application/pdf") {
      // Usar pdf-parse para extraer texto de PDFs
      const parser = new PDFParse(fileBuffer);
      const pdfData = await parser.getText();
      extractedText = pdfData.text || "";
    } 
    else if (
      mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || 
      fileName.endsWith(".docx")
    ) {
      // Usar nuestro extractor JSZip de alto rendimiento para Word
      extractedText = await extractTextFromDocx(fileBuffer);
    } 
    else if (mimeType.startsWith("text/") || fileName.endsWith(".txt") || fileName.endsWith(".md") || fileName.endsWith(".json")) {
      // Leer texto plano directamente
      extractedText = fileBuffer.toString("utf-8");
    } 
    else {
      return NextResponse.json(
        { error: `Formato de archivo no soportado: '${mimeType}'. Sube un archivo PDF, Word, Imagen o Texto plano.` },
        { status: 400 }
      );
    }

    // Limpiar espacios en blanco excesivos
    extractedText = extractedText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

    console.log(`[Text Extraction] Archivo '${fileName}' procesado con éxito. Caracteres extraídos: ${extractedText.length}`);

    return NextResponse.json({
      success: true,
      fileName,
      mimeType,
      sizeBytes: fileBuffer.length,
      text: extractedText,
    });

  } catch (err) {
    console.error("[Text Extraction] Error crítico en api/rag/extract-text:", err);
    return NextResponse.json(
      { error: `Error al procesar el archivo: ${err.message}` },
      { status: 500 }
    );
  }
}
