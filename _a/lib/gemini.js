/**
 * ════════════════════════════════════════════════════════════════════════════
 * Archivo: lib/gemini.js
 * Descripcion: Utilidades para interactuar con la API REST de Google Gemini
 *              (Generación de Embeddings y Generación de Contenido RAG)
 *              sin dependencias de paquetes npm externos.
 * ════════════════════════════════════════════════════════════════════════════
 */

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

/**
 * Genera un vector (embedding) de 768 dimensiones para un bloque de texto
 * utilizando el modelo gemini-embedding-2 de Google con outputDimensionality de 768.
 *
 * @param {string} text - El texto a vectorizar
 * @returns {Promise<number[]>} Vector de 768 float4 values
 */
export async function getEmbedding(text) {
  if (!GEMINI_API_KEY) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY en el servidor.");
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-embedding-2:embedContent?key=${GEMINI_API_KEY}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "models/gemini-embedding-2",
      content: {
        parts: [{ text }],
      },
      outputDimensionality: 768,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en Gemini Embeddings API: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const vector = data.embedding?.values;
  
  if (!vector || !Array.isArray(vector)) {
    throw new Error("La API de Gemini no retornó un vector válido.");
  }

  return vector;
}

/**
 * Genera embeddings en lote (batch) para un conjunto de bloques de texto
 * utilizando el modelo gemini-embedding-2 de Google con outputDimensionality de 768.
 *
 * @param {string[]} texts - Array de textos a vectorizar
 * @returns {Promise<number[][]>} Array de vectores
 */
export async function getEmbeddingsBatch(texts) {
  if (!GEMINI_API_KEY) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY en el servidor.");
  }

  if (!texts || texts.length === 0) return [];

  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-embedding-2:batchEmbedContents?key=${GEMINI_API_KEY}`;
  
  const requests = texts.map(text => ({
    model: "models/gemini-embedding-2",
    content: {
      parts: [{ text }],
    },
    outputDimensionality: 768,
  }));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en Gemini Batch Embeddings API: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const embeddings = data.embeddings?.map(e => e.values) || [];
  
  if (embeddings.length !== texts.length) {
    throw new Error("La cantidad de embeddings retornada no coincide con la solicitada.");
  }

  return embeddings;
}

/**
 * Llama al modelo de lenguaje gemini-1.5-flash para responder una consulta
 * utilizando fragmentos de contexto inyectados (RAG).
 *
 * @param {string} prompt - El prompt estructurado (Contexto + Pregunta)
 * @returns {Promise<string>} La respuesta en formato Markdown
 */
export async function generateRAGResponse(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error("Falta la variable de entorno GEMINI_API_KEY en el servidor.");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.15, // Temperatura baja para respuestas factuales sin alucinaciones
        maxOutputTokens: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error en Gemini Text Generation API: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error("La API de Gemini no retornó una respuesta de texto válida.");
  }

  return text;
}
