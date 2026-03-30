/**
 * @file JqlSearchBar.js
 * @description Barra de búsqueda avanzada JQL para la Vista General.
 *   Incluye:
 *   - Input estilizado tipo Jira con validación en tiempo real
 *   - Autocompletado inteligente de campos, operadores y valores
 *   - Panel de queries de ejemplo predefinidas
 *   - Indicador visual de modo activo/inactivo
 *   - Bloqueo de filtros por columna cuando JQL está activo
 */
"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  executeJql,
  validateJql,
  getAutocompleteSuggestions,
  EXAMPLE_QUERIES,
} from "@/lib/jqlParser";

/**
 * Barra de búsqueda JQL con autocompletado y queries de ejemplo.
 *
 * @param {Object}   props
 * @param {Array}    props.tickets       - Todos los tickets cargados
 * @param {Function} props.onResults     - Callback con tickets filtrados por JQL
 * @param {Function} props.onActiveChange - Callback para notificar si JQL está activo (bloquear filtros)
 * @param {Object}   props.helpers       - { resolveName, resolveEpic, localComments }
 */
export default function JqlSearchBar({ tickets = [], onResults, onActiveChange, helpers = {} }) {
  const [query, setQuery]               = useState("");
  const [error, setError]               = useState(null);
  const [isJqlActive, setIsJqlActive]   = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions]   = useState([]);
  const [selectedIdx, setSelectedIdx]   = useState(-1);
  const [replaceRange, setReplaceRange] = useState({ from: 0, to: 0 });
  const [resultCount, setResultCount]   = useState(null);

  const inputRef     = useRef(null);
  const suggestRef   = useRef(null);
  const examplesRef  = useRef(null);
  const debounceRef  = useRef(null);

  // ── Ejecutar query JQL ──────────────────────────────────────────
  const runQuery = useCallback((jql) => {
    if (!jql.trim()) {
      setError(null);
      setResultCount(null);
      setIsJqlActive(false);
      onActiveChange?.(false);
      onResults?.(null);
      return;
    }

    const { results, error: execError } = executeJql(jql, tickets, helpers);
    if (execError) {
      setError(execError);
      setResultCount(null);
      setIsJqlActive(true);
      onActiveChange?.(true);
      onResults?.(null);
    } else {
      setError(null);
      setResultCount(results.length);
      setIsJqlActive(true);
      onActiveChange?.(true);
      onResults?.(results);
    }
  }, [tickets, helpers, onResults, onActiveChange]);

  // ── Debounce de ejecución ───────────────────────────────────────
  const handleInputChange = useCallback((e) => {
    const val = e.target.value;
    setQuery(val);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runQuery(val);
    }, 400);

    // Autocompletado
    const cursor = e.target.selectionStart || val.length;
    const { suggestions: suggs, replaceFrom, replaceTo } = getAutocompleteSuggestions(
      val, cursor, tickets, helpers
    );
    setSuggestions(suggs);
    setReplaceRange({ from: replaceFrom, to: replaceTo });
    setSelectedIdx(-1);
    setShowSuggestions(suggs.length > 0);
  }, [tickets, helpers, runQuery]);

  // ── Aplicar sugerencia ──────────────────────────────────────────
  const applySuggestion = useCallback((suggestion) => {
    const before = query.slice(0, replaceRange.from);
    const after  = query.slice(replaceRange.to);
    let insertValue = suggestion.value;

    // Agregar espacio después si es campo u operador
    if (suggestion.type === "field" || suggestion.type === "operator") {
      insertValue += " ";
    }

    const newQuery = before + insertValue + after;
    setQuery(newQuery);
    setShowSuggestions(false);
    setSuggestions([]);

    // Focus y mover cursor
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursor = (before + insertValue).length;
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 0);

    // Re-evaluar query si es un valor
    if (suggestion.type === "value") {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runQuery(newQuery), 200);
    }
  }, [query, replaceRange, runQuery]);

  // ── Teclado: navegar sugerencias ────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab" || e.key === "Enter") {
        if (selectedIdx >= 0 && selectedIdx < suggestions.length) {
          e.preventDefault();
          applySuggestion(suggestions[selectedIdx]);
          return;
        }
        if (e.key === "Tab" && suggestions.length > 0) {
          e.preventDefault();
          applySuggestion(suggestions[0]);
          return;
        }
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }

    // Enter sin sugerencia seleccionada: ejecutar
    if (e.key === "Enter") {
      e.preventDefault();
      clearTimeout(debounceRef.current);
      runQuery(query);
      setShowSuggestions(false);
    }
  }, [showSuggestions, suggestions, selectedIdx, applySuggestion, runQuery, query]);

  // ── Limpiar query ───────────────────────────────────────────────
  const clearQuery = useCallback(() => {
    setQuery("");
    setError(null);
    setResultCount(null);
    setIsJqlActive(false);
    onActiveChange?.(false);
    onResults?.(null);
    setShowSuggestions(false);
    inputRef.current?.focus();
  }, [onActiveChange, onResults]);

  // ── Aplicar query de ejemplo ────────────────────────────────────
  const applyExample = useCallback((jql) => {
    setQuery(jql);
    setShowExamples(false);
    clearTimeout(debounceRef.current);
    runQuery(jql);
    inputRef.current?.focus();
  }, [runQuery]);

  // ── Click fuera cierra popups ───────────────────────────────────
  useEffect(() => {
    function handleClick(e) {
      if (suggestRef.current && !suggestRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
      if (examplesRef.current && !examplesRef.current.contains(e.target)) {
        setShowExamples(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // ── Scroll de sugerencia seleccionada a la vista ────────────────
  useEffect(() => {
    if (selectedIdx >= 0 && suggestRef.current) {
      const el = suggestRef.current.children[selectedIdx];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIdx]);

  // ── Colores del icono de tipo de sugerencia ─────────────────────
  const typeColors = {
    field:    "bg-blue-100 text-blue-700 border-blue-200",
    operator: "bg-purple-100 text-purple-700 border-purple-200",
    value:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  };

  return (
    <div className="relative animate-fade-in">
      {/* ── Barra principal ── */}
      <div className={`
        relative flex items-center gap-2 px-4 py-3 rounded-2xl border-2 transition-all duration-300
        ${error
          ? "border-red-300 bg-red-50/50 shadow-sm shadow-red-100"
          : isJqlActive
            ? "border-blue-400 bg-blue-50/30 shadow-md shadow-blue-100/50"
            : "border-gray-200 bg-white hover:border-gray-300 shadow-sm"
        }
      `}>
        {/* Icono JQL */}
        <div className={`
          flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors duration-300
          ${isJqlActive ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-400"}
        `}>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>

        {/* Label JQL */}
        <span className={`text-xs font-bold uppercase tracking-wider shrink-0 select-none transition-colors ${isJqlActive ? "text-blue-600" : "text-gray-300"}`}>
          JQL
        </span>

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggestions(true);
          }}
          placeholder='Buscar con JQL... ej: type = Historia AND status = "En curso"'
          className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none font-mono min-w-0"
          spellCheck={false}
          autoComplete="off"
        />

        {/* Contador de resultados */}
        {isJqlActive && resultCount !== null && !error && (
          <span className="shrink-0 px-2.5 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200">
            {resultCount} resultado{resultCount !== 1 ? "s" : ""}
          </span>
        )}

        {/* Botón de ejemplos */}
        <button
          onClick={() => setShowExamples(!showExamples)}
          className="shrink-0 p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-500 transition-colors"
          title="Queries de ejemplo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </button>

        {/* Botón limpiar */}
        {query && (
          <button
            onClick={clearQuery}
            className="shrink-0 p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            title="Limpiar búsqueda"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Error message ── */}
      {error && (
        <div className="mt-2 flex items-start gap-2 px-4 py-2.5 rounded-xl bg-red-50 border border-red-200 animate-fade-in">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-red-600 font-medium font-mono">{error}</p>
        </div>
      )}

      {/* ── JQL activo: indicador ── */}
      {isJqlActive && !error && (
        <div className="mt-2 flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-50 border border-blue-200 animate-fade-in">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-xs text-blue-600 font-medium">
            Modo JQL activo — los filtros por columna están deshabilitados
          </p>
          <button
            onClick={clearQuery}
            className="ml-auto text-xs text-blue-500 hover:text-blue-700 font-semibold hover:underline"
          >
            Desactivar
          </button>
        </div>
      )}

      {/* ── Panel de sugerencias de autocompletado ── */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestRef}
          className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-64 overflow-y-auto animate-fade-in"
        >
          {suggestions.map((s, i) => (
            <button
              key={`${s.type}-${s.value}-${i}`}
              onMouseDown={(e) => { e.preventDefault(); applySuggestion(s); }}
              className={`
                w-full text-left px-4 py-2.5 text-sm flex items-center gap-3 transition-colors
                ${i === selectedIdx ? "bg-blue-50" : "hover:bg-gray-50"}
                ${i < suggestions.length - 1 ? "border-b border-gray-50" : ""}
              `}
            >
              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${typeColors[s.type] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {s.type === "field" ? "campo" : s.type === "operator" ? "op" : "valor"}
              </span>
              <span className="font-mono text-gray-700">{s.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Panel de queries de ejemplo ── */}
      {showExamples && (
        <div
          ref={examplesRef}
          className="absolute z-50 top-full right-0 mt-1 w-[420px] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-fade-in"
        >
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
            <h4 className="text-xs font-bold text-gray-600 uppercase tracking-wider">Queries de ejemplo</h4>
            <p className="text-[11px] text-gray-400 mt-0.5">Haz clic para usar una query</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {EXAMPLE_QUERIES.map((ex, i) => (
              <button
                key={i}
                onClick={() => applyExample(ex.jql)}
                className="w-full text-left px-4 py-3 hover:bg-blue-50/50 transition-colors border-b border-gray-50 last:border-b-0 group"
              >
                <p className="text-xs font-semibold text-gray-700 group-hover:text-blue-600 transition-colors">{ex.label}</p>
                <p className="text-[11px] font-mono text-gray-400 mt-0.5 group-hover:text-blue-500 transition-colors">{ex.jql}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
