/**
 * @file dashboard/conocimiento/page.js
 * @description Módulo de Gestor de Conocimiento e Inteligencia Artificial (RAG Epic Context).
 *              Permite chatear de forma interactiva con el contexto de las Épicas Jira y
 *              subir documentos (PDF, Word, Imágenes) indexados de forma segura mediante lotes.
 *
 * @route /dashboard/conocimiento
 */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";
import Card from "@/components/ui/Card";

export default function ConocimientoIAPage() {
  // ─── Estados locales ────────────────────────────────────────────────────────
  const [epics, setEpics] = useState([]);
  const [selectedEpic, setSelectedEpic] = useState(""); // "" = Global
  const [loadingEpics, setLoadingEpics] = useState(true);

  // Chat
  const [query, setQuery] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [querying, setQuerying] = useState(false);
  const [lastReferences, setLastReferences] = useState([]);
  const chatEndRef = useRef(null);

  // Ingesta de Archivos
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(""); // e.g., "Extrayendo texto..."
  const [uploadProgress, setUploadProgress] = useState(0); // 0 a 100
  const fileInputRef = useRef(null);

  // Archivos ya indexados
  const [indexedFiles, setIndexedFiles] = useState([]);
  const [loadingFiles, setLoadingFiles] = useState(true);

  // ─── Cargar datos iniciales ──────────────────────────────────────────────────
  const fetchEpicsAndFiles = useCallback(async () => {
    try {
      // 1. Obtener todas las Épicas registradas en Jira
      const { data: epicsData } = await supabase
        .from("jira_tickets")
        .select("jira_key, summary")
        .is("deleted_at", null)
        .eq("issue_type", "Épica")
        .order("jira_key", { ascending: true });
      
      if (epicsData) setEpics(epicsData);
      setLoadingEpics(false);

      // 2. Obtener lista única de archivos indexados en la base de datos vectorial
      const { data: vectorFiles, error: vecErr } = await supabase
        .from("documentos_embeddings")
        .select("source_key, source_type")
        .eq("source_type", "documento_subido");

      if (vectorFiles) {
        // Eliminar duplicados locales por clave
        const uniqueFiles = [];
        vectorFiles.forEach(item => {
          if (!uniqueFiles.some(f => f.source_key === item.source_key)) {
            uniqueFiles.push(item);
          }
        });
        setIndexedFiles(uniqueFiles);
      }
      setLoadingFiles(false);
    } catch (err) {
      console.error("Error al cargar datos iniciales del Gestor de IA:", err);
    }
  }, []);

  useEffect(() => {
    fetchEpicsAndFiles();
  }, [fetchEpicsAndFiles]);

  // Scroll automático en el chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, querying]);

  // ─── Enviar consulta RAG a la IA ──────────────────────────────────────────────
  async function handleSendQuery(e) {
    e.preventDefault();
    if (!query.trim() || querying) return;

    const userMessage = { role: "user", content: query };
    setChatHistory(prev => [...prev, userMessage]);
    setQuery("");
    setQuerying(true);
    setLastReferences([]);

    try {
      const response = await fetch("/api/rag/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query,
          epicKey: selectedEpic || null,
          history: chatHistory,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Error al procesar la consulta.");
      }

      const assistantMessage = { role: "assistant", content: data.response };
      setChatHistory(prev => [...prev, assistantMessage]);
      if (data.references) {
        setLastReferences(data.references);
      }
    } catch (err) {
      console.error("Error en consulta RAG:", err);
      setChatHistory(prev => [
        ...prev,
        { role: "assistant", content: `❌ **Error:** ${err.message || "No se pudo conectar con el motor de IA."}` }
      ]);
    } finally {
      setQuerying(false);
    }
  }

  // ─── Limpiar historial del chat ──────────────────────────────────────────────
  function handleClearChat() {
    setChatHistory([]);
    setLastReferences([]);
  }

  // ─── Procesar e indexar archivo por lotes (Client-Side Batching) ──────────────
  async function handleFileUpload(e) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setUploading(true);
    setUploadStatus("Extrayendo texto del archivo...");
    setUploadProgress(5);

    try {
      // Paso 1: Enviar el archivo binario a extraer su texto
      const formData = new FormData();
      formData.append("file", selectedFile);

      const extractRes = await fetch("/api/rag/extract-text", {
        method: "POST",
        body: formData,
      });

      const extractData = await extractRes.json();

      if (!extractRes.ok) {
        throw new Error(extractData.error || "No se pudo extraer el texto del archivo.");
      }

      const text = extractData.text;
      if (!text || text.trim().length === 0) {
        throw new Error("El archivo está vacío o no se pudo extraer ningún texto legible.");
      }

      setUploadStatus("Fragmentando texto y preparando lotes...");
      setUploadProgress(20);

      // Paso 2: Crear fragmentos (chunks) locales de 800 caracteres con 100 caracteres de solapamiento
      const chunkSize = 800;
      const overlap = 100;
      const chunks = [];
      let i = 0;

      while (i < text.length) {
        const chunkText = text.substring(i, i + chunkSize);
        chunks.push(chunkText);
        i += chunkSize - overlap;
      }

      console.log(`Texto extraído: ${text.length} caracteres. Creados ${chunks.length} fragmentos.`);

      // Paso 3: Dividir en lotes de 5 chunks y enviar secuencialmente al servidor
      const batchSize = 5;
      const totalBatches = Math.ceil(chunks.length / batchSize);
      
      setUploadStatus(`Indexando fragmentos vectoriales... (0 de ${chunks.length})`);
      
      for (let b = 0; b < totalBatches; b++) {
        const startIdx = b * batchSize;
        const batchChunks = chunks.slice(startIdx, startIdx + batchSize);
        
        const embedRes = await fetch("/api/rag/embed-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chunks: batchChunks,
            sourceType: "documento_subido",
            sourceKey: selectedFile.name,
            metadata: {
              epic_key: selectedEpic || null,
              file_size: selectedFile.size,
              uploaded_at: new Date().toISOString()
            }
          }),
        });

        const embedData = await embedRes.json();
        if (!embedRes.ok) {
          throw new Error(embedData.error || "Error al indexar lote de fragmentos.");
        }

        // Actualizar progreso
        const processedCount = Math.min(startIdx + batchSize, chunks.length);
        const percent = Math.round(20 + ((b + 1) / totalBatches) * 80);
        setUploadProgress(percent);
        setUploadStatus(`Indexando fragmentos vectoriales... (${processedCount} de ${chunks.length})`);
      }

      // Finalización exitosa
      setUploadStatus("¡Archivo indexado con éxito!");
      setUploadProgress(100);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      
      // Recargar archivos indexados
      await fetchEpicsAndFiles();

      setTimeout(() => {
        setUploading(false);
        setUploadStatus("");
        setUploadProgress(0);
      }, 3000);

    } catch (err) {
      console.error("Error al indexar archivo:", err);
      setUploadStatus(`❌ Error: ${err.message}`);
      setUploadProgress(0);
      setTimeout(() => {
        setUploading(false);
        setUploadStatus("");
      }, 5000);
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="animate-fade-in flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900 flex items-center gap-2.5">
            Gestor de IA y Conocimiento
            <span className="text-xs px-2 py-0.5 font-bold uppercase rounded-md bg-orange-50 text-orange-600 border border-orange-200">RAG Context</span>
          </h1>
          <p className="text-gray-500 mt-1">Interrelaciona tus tickets de Jira con especificaciones de PDF, Word e imágenes mediante Inteligencia Artificial.</p>
        </div>

        {/* Selector de Épica Contextual */}
        <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl px-3.5 py-2 shadow-sm shrink-0">
          <span className="text-xs font-semibold text-gray-500 uppercase shrink-0">Anclar Contexto:</span>
          {loadingEpics ? (
            <div className="skeleton h-5 w-28" />
          ) : (
            <select
              value={selectedEpic}
              onChange={(e) => setSelectedEpic(e.target.value)}
              className="text-xs font-medium text-gray-700 bg-transparent border-0 focus:outline-none focus:ring-0 cursor-pointer max-w-[200px]"
            >
              <option value="">Global (Toda la base de datos)</option>
              {epics.map(epic => (
                <option key={epic.jira_key} value={epic.jira_key}>
                  {epic.jira_key} · {epic.summary}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Grid Contenedor Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Panel del Chat Asistente (Col-span 2) */}
        <div className="lg:col-span-2 flex flex-col bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden h-[620px]">
          {/* Cabecera del Chat */}
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-sm font-semibold text-gray-900">Asistente IA Antigravity</span>
            </div>
            <button
              onClick={handleClearChat}
              disabled={chatHistory.length === 0}
              className="text-xs font-medium text-gray-400 hover:text-red-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Limpiar Chat
            </button>
          </div>

          {/* Área de Mensajes */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-gray-50/20">
            {chatHistory.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center text-orange-500">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">¿En qué puedo ayudarte hoy?</p>
                  <p className="text-xs text-gray-400 mt-1 max-w-sm">
                    Haz preguntas sobre tus tickets o archivos cargados. {selectedEpic ? `Actualmente respondiendo bajo el contexto de la Épica ${selectedEpic}.` : "Respondiendo de forma global."}
                  </p>
                </div>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex gap-3 max-w-[85%] ${msg.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                >
                  <div
                    className={`
                      w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0
                      ${msg.role === "user" 
                        ? "bg-orange-500 text-white" 
                        : "bg-gray-100 text-orange-500 ring-1 ring-gray-200"
                      }
                    `}
                  >
                    {msg.role === "user" ? "U" : "AI"}
                  </div>
                  <div
                    className={`
                      px-4 py-3 rounded-2xl text-sm leading-relaxed border shadow-sm
                      ${msg.role === "user"
                        ? "bg-orange-500 text-white border-orange-600"
                        : "bg-white text-gray-800 border-gray-150"
                      }
                    `}
                  >
                    <div className="prose prose-sm max-w-none prose-headings:font-bold prose-p:my-1 text-inherit">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {querying && (
              <div className="flex gap-3 mr-auto items-center">
                <div className="w-8 h-8 rounded-lg bg-gray-100 text-orange-500 flex items-center justify-center font-bold text-xs shrink-0 ring-1 ring-gray-200">
                  AI
                </div>
                <div className="flex items-center gap-1.5 px-4 py-3 bg-white border border-gray-200 rounded-2xl shadow-sm text-xs text-gray-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                  <span>Buscando en embeddings y redactando respuesta...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Referencias del último mensaje */}
          {lastReferences.length > 0 && (
            <div className="px-6 py-2.5 bg-gray-50 border-t border-b border-gray-100 flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Fuentes Utilizadas:</span>
              {lastReferences.map((ref, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-gray-200 text-[10px] font-medium text-gray-600 shadow-sm"
                  title={`Similitud semántica: ${(ref.similarity * 100).toFixed(1)}%`}
                >
                  📄 {ref.sourceKey}
                </span>
              ))}
            </div>
          )}

          {/* Formulario de Entrada */}
          <form onSubmit={handleSendQuery} className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={selectedEpic ? `Preguntar sobre Épica ${selectedEpic}...` : "Preguntar al Gestor de IA..."}
              disabled={querying}
              className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!query.trim() || querying}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center gap-1.5"
            >
              <span>Preguntar</span>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </form>
        </div>

        {/* Panel Derecho: Administrador de Documentos RAG */}
        <div className="space-y-6">
          {/* Tarjeta de Carga de Documentos */}
          <Card className="p-6">
            <h3 className="font-semibold text-gray-900 text-sm mb-1.5">Indexar Nuevo Documento</h3>
            <p className="text-xs text-gray-400 mb-4">Sube un archivo PDF, Word (.docx) o Imagen para transcribirlo e indexarlo en el motor vectorial del RAG.</p>

            {/* Input de Carga de archivos */}
            <div className="space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.docx,.txt,.png,.jpg,.jpeg"
                disabled={uploading}
                className="hidden"
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className={`
                  w-full h-32 border-2 border-dashed border-gray-200 hover:border-orange-400 rounded-2xl
                  flex flex-col items-center justify-center text-center p-4 transition-all group
                  ${uploading ? "opacity-50 cursor-not-allowed bg-gray-50/50" : "hover:bg-orange-50/20 bg-white cursor-pointer"}
                `}
              >
                <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 group-hover:scale-105 transition-transform flex items-center justify-center mb-2">
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-gray-700">Subir archivo para IA</span>
                <span className="text-[10px] text-gray-400 mt-1">PDF, Word, Imágenes o Texto</span>
              </button>

              {/* Progress and status */}
              {uploading && (
                <div className="space-y-2 p-3 bg-gray-50 border border-gray-150 rounded-xl animate-fade-in">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-gray-600">
                    <span className="truncate max-w-[70%]">{uploadStatus}</span>
                    <span className="text-orange-600 shrink-0 font-bold">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden shadow-inner">
                    <div
                      className="bg-orange-500 h-1.5 rounded-full transition-all duration-300 shadow-sm"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Tarjeta de Archivos Indexados */}
          <Card className="p-6 h-[290px] flex flex-col">
            <h3 className="font-semibold text-gray-900 text-sm mb-1">Documentación Indexada</h3>
            <p className="text-xs text-gray-400 mb-3">Archivos actualmente integrados en el espacio vectorial:</p>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {loadingFiles ? (
                <div className="space-y-2">
                  <div className="skeleton h-10 w-full" />
                  <div className="skeleton h-10 w-full" />
                </div>
              ) : indexedFiles.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-4">
                  <span className="text-[11px] text-gray-400">No hay documentos indexados aún.</span>
                </div>
              ) : (
                indexedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 border border-gray-150 rounded-xl hover:bg-gray-100/50 transition-colors shadow-sm"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-base shrink-0">📄</span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 truncate" title={file.source_key}>
                          {file.source_key}
                        </p>
                        <p className="text-[9px] font-bold text-orange-600 uppercase">Procesado</p>
                      </div>
                    </div>
                    
                    <span className="text-[9px] px-1.5 py-0.5 bg-white border border-gray-200 text-gray-500 rounded font-semibold shrink-0">
                      AI Ok
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
