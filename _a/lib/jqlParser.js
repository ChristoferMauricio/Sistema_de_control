/**
 * @file jqlParser.js
 * @description Motor de JQL (Jira Query Language) para filtrado de tickets del lado del cliente.
 *   Implementa un pipeline completo: Tokenizer → Parser → Evaluator.
 *
 *   Operadores soportados:
 *     =, !=, ~, !~, >, >=, <, <=, IN, NOT IN, IS EMPTY, IS NOT EMPTY
 *
 *   Lógicos: AND, OR (AND tiene mayor precedencia), paréntesis
 *   Ordenamiento: ORDER BY field ASC|DESC
 *
 *   Campos: project, key, summary, status, type/issuetype, sprint, assignee,
 *           reporter, priority, storyPoints, parent, epic, labels, created,
 *           updated, comment/comentario
 */

// ═══════════════════════════════════════════════════════════════════
//  CONSTANTES Y MAPEO DE CAMPOS
// ═══════════════════════════════════════════════════════════════════

/** Mapeo de nombres JQL → campo real en el ticket o campo virtual */
export const FIELD_MAP = {
  project:      { field: "_project",       type: "virtual" },
  key:          { field: "jira_key",       type: "string"  },
  issuekey:     { field: "jira_key",       type: "string"  },
  summary:      { field: "summary",        type: "string"  },
  resumen:      { field: "summary",        type: "string"  },
  status:       { field: "status",         type: "string"  },
  estado:       { field: "status",         type: "string"  },
  type:         { field: "issue_type",     type: "string"  },
  issuetype:    { field: "issue_type",     type: "string"  },
  tipo:         { field: "issue_type",     type: "string"  },
  sprint:       { field: "sprint",         type: "string"  },
  assignee:     { field: "_assignee",      type: "resolved" },
  asignado:     { field: "_assignee",      type: "resolved" },
  reporter:     { field: "_reporter",      type: "resolved" },
  informador:   { field: "_reporter",      type: "resolved" },
  priority:     { field: "priority",       type: "string"  },
  prioridad:    { field: "priority",       type: "string"  },
  storypoints:  { field: "story_points",   type: "number"  },
  story_points: { field: "story_points",   type: "number"  },
  sp:           { field: "story_points",   type: "number"  },
  parent:       { field: "parent_key",     type: "string"  },
  principal:    { field: "parent_key",     type: "string"  },
  epic:         { field: "_epic",          type: "resolved" },
  epica:        { field: "_epic",          type: "resolved" },
  labels:       { field: "labels",         type: "string"  },
  etiquetas:    { field: "labels",         type: "string"  },
  created:      { field: "created_at",     type: "date"    },
  creada:       { field: "created_at",     type: "date"    },
  updated:      { field: "updated_at",     type: "date"    },
  actualizada:  { field: "updated_at",     type: "date"    },
  comment:      { field: "comentario",     type: "string"  },
  comentario:   { field: "comentario",     type: "string"  },
  observaciones:{ field: "comentario",     type: "string"  },
};

/** Lista de nombre de campos JQL para autocompletado */
export const JQL_FIELDS = Object.keys(FIELD_MAP);

/** Operadores JQL soportados (orden importa: los más largos primero para tokenizar correctamente) */
export const JQL_OPERATORS = [
  "NOT IN", "IS NOT EMPTY", "IS EMPTY", "IN",
  "!=", "!~", ">=", "<=", ">", "<", "=", "~",
];

/** Campos que soportan autocompletado de valores */
export const AUTOCOMPLETE_FIELDS = {
  status:    (tickets) => [...new Set(tickets.map(t => t.status).filter(Boolean))].sort(),
  estado:    (tickets) => [...new Set(tickets.map(t => t.status).filter(Boolean))].sort(),
  type:      (tickets) => [...new Set(tickets.map(t => t.issue_type).filter(Boolean))].sort(),
  issuetype: (tickets) => [...new Set(tickets.map(t => t.issue_type).filter(Boolean))].sort(),
  tipo:      (tickets) => [...new Set(tickets.map(t => t.issue_type).filter(Boolean))].sort(),
  sprint:    (tickets) => [...new Set(tickets.map(t => t.sprint).filter(Boolean))].sort(),
  priority:  (tickets) => [...new Set(tickets.map(t => t.priority).filter(Boolean))].sort(),
  prioridad: (tickets) => [...new Set(tickets.map(t => t.priority).filter(Boolean))].sort(),
  project:   ()        => ["PF3", "PF3QA"],
};

/** Queries de ejemplo para mostrar al usuario */
export const EXAMPLE_QUERIES = [
  { label: "Historias en curso",          jql: 'type = Historia AND status = "En curso"' },
  { label: "Bugs del proyecto QA",        jql: "project = PF3QA AND type = Bug" },
  { label: "Tickets del Sprint actual",   jql: 'sprint = "F3.03 Sprint 1"' },
  { label: "Épicas del proyecto PF3",     jql: "project = PF3 AND type = Epic" },
  { label: "Subtareas sin asignar",       jql: "type = Subtarea AND assignee IS EMPTY" },
  { label: "Creados en 2026",             jql: 'created >= "2026-01-01"' },
  { label: "Bugs finalizados",            jql: "type = Bug AND status = Finalizada" },
  { label: "Ordenar por fecha creación",  jql: "project = PF3 ORDER BY created DESC" },
];


// ═══════════════════════════════════════════════════════════════════
//  TOKENIZER (Lexer)
// ═══════════════════════════════════════════════════════════════════

/**
 * Token types producidos por el tokenizer.
 * @enum {string}
 */
const TT = {
  FIELD:    "FIELD",
  OP:       "OP",
  VALUE:    "VALUE",
  AND:      "AND",
  OR:       "OR",
  LPAREN:   "LPAREN",
  RPAREN:   "RPAREN",
  ORDER_BY: "ORDER_BY",
  ASC:      "ASC",
  DESC:     "DESC",
  COMMA:    "COMMA",
  EOF:      "EOF",
};

/**
 * Divide una cadena JQL en tokens.
 * @param {string} input - Query JQL
 * @returns {{ tokens: Array<{type: string, value: string, pos: number}>, error: string|null }}
 */
export function tokenize(input) {
  const tokens = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // Saltar espacios
    if (/\s/.test(input[i])) { i++; continue; }

    const remaining = input.slice(i);

    // ORDER BY (case-insensitive)
    const orderByMatch = remaining.match(/^ORDER\s+BY\b/i);
    if (orderByMatch) {
      tokens.push({ type: TT.ORDER_BY, value: "ORDER BY", pos: i });
      i += orderByMatch[0].length;
      continue;
    }

    // AND / OR (case-insensitive, word boundary)
    const andMatch = remaining.match(/^AND\b/i);
    if (andMatch) {
      tokens.push({ type: TT.AND, value: "AND", pos: i });
      i += 3;
      continue;
    }
    const orMatch = remaining.match(/^OR\b/i);
    if (orMatch) {
      tokens.push({ type: TT.OR, value: "OR", pos: i });
      i += 2;
      continue;
    }

    // ASC / DESC
    const ascMatch = remaining.match(/^ASC\b/i);
    if (ascMatch) {
      tokens.push({ type: TT.ASC, value: "ASC", pos: i });
      i += 3;
      continue;
    }
    const descMatch = remaining.match(/^DESC\b/i);
    if (descMatch) {
      tokens.push({ type: TT.DESC, value: "DESC", pos: i });
      i += 4;
      continue;
    }

    // Paréntesis
    if (input[i] === "(") { tokens.push({ type: TT.LPAREN, value: "(", pos: i }); i++; continue; }
    if (input[i] === ")") { tokens.push({ type: TT.RPAREN, value: ")", pos: i }); i++; continue; }

    // Coma
    if (input[i] === ",") { tokens.push({ type: TT.COMMA, value: ",", pos: i }); i++; continue; }

    // Operadores multi-carácter: NOT IN, IS NOT EMPTY, IS EMPTY, IN
    let opFound = false;
    for (const op of JQL_OPERATORS) {
      const re = new RegExp(`^${op.replace(/\s+/g, "\\s+")}\\b`, "i");
      const opMatch = remaining.match(re);
      if (opMatch) {
        tokens.push({ type: TT.OP, value: op.toUpperCase(), pos: i });
        i += opMatch[0].length;
        opFound = true;
        break;
      }
    }
    if (opFound) continue;

    // Operadores de un carácter: =, !=, !~, >=, <=, >, <, ~
    if (input[i] === "!" && i + 1 < len && (input[i + 1] === "=" || input[i + 1] === "~")) {
      tokens.push({ type: TT.OP, value: input[i] + input[i + 1], pos: i });
      i += 2;
      continue;
    }
    if ((input[i] === ">" || input[i] === "<") && i + 1 < len && input[i + 1] === "=") {
      tokens.push({ type: TT.OP, value: input[i] + input[i + 1], pos: i });
      i += 2;
      continue;
    }
    if ("=~><".includes(input[i])) {
      tokens.push({ type: TT.OP, value: input[i], pos: i });
      i++;
      continue;
    }

    // Valor entre comillas
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      let j = i + 1;
      while (j < len && input[j] !== quote) j++;
      if (j >= len) {
        return { tokens: [], error: `Comilla sin cerrar en posición ${i}` };
      }
      tokens.push({ type: TT.VALUE, value: input.slice(i + 1, j), pos: i });
      i = j + 1;
      continue;
    }

    // Palabra desnuda (campo o valor sin comillas)
    if (/[a-zA-Z0-9_\-.]/.test(input[i])) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_\-.]/.test(input[j])) j++;
      const word = input.slice(i, j);
      const wordLower = word.toLowerCase();

      // Decidir si es un campo o un valor según contexto
      const lastToken = tokens[tokens.length - 1];

      if (wordLower === "empty") {
        // EMPTY como parte de IS EMPTY / IS NOT EMPTY (ya manejado arriba, pero por si acaso)
        tokens.push({ type: TT.VALUE, value: word, pos: i });
      } else if (lastToken && (lastToken.type === TT.OP || lastToken.type === TT.COMMA || lastToken.type === TT.ORDER_BY)) {
        // Después de operador, coma u ORDER BY → es un valor o campo de ORDER BY
        if (lastToken.type === TT.ORDER_BY) {
          tokens.push({ type: TT.FIELD, value: wordLower, pos: i });
        } else {
          tokens.push({ type: TT.VALUE, value: word, pos: i });
        }
      } else if (FIELD_MAP[wordLower]) {
        tokens.push({ type: TT.FIELD, value: wordLower, pos: i });
      } else {
        // podría ser un valor sin comillas
        tokens.push({ type: TT.VALUE, value: word, pos: i });
      }

      i = j;
      continue;
    }

    return { tokens: [], error: `Carácter inesperado '${input[i]}' en posición ${i}` };
  }

  tokens.push({ type: TT.EOF, value: "", pos: i });
  return { tokens, error: null };
}


// ═══════════════════════════════════════════════════════════════════
//  PARSER (Token stream → AST)
// ═══════════════════════════════════════════════════════════════════

/**
 * Parsea tokens JQL a un AST (Abstract Syntax Tree).
 *
 * Gramática simplificada:
 *   query     → orExpr (ORDER_BY orderList)?
 *   orExpr    → andExpr (OR andExpr)*
 *   andExpr   → atom (AND atom)*
 *   atom      → LPAREN orExpr RPAREN | condition
 *   condition → FIELD OP value | FIELD OP LPAREN valueList RPAREN | FIELD IS [NOT] EMPTY
 *   orderList → orderItem (COMMA orderItem)*
 *   orderItem → FIELD (ASC|DESC)?
 *
 * @param {Array} tokens
 * @returns {{ ast: Object|null, orderBy: Array|null, error: string|null }}
 */
export function parse(tokens) {
  let pos = 0;

  function peek() { return tokens[pos]; }
  function advance() { return tokens[pos++]; }
  function expect(type) {
    const t = peek();
    if (!t || t.type !== type) {
      throw new Error(`Se esperaba ${type} pero se encontró ${t ? t.type + ' ("' + t.value + '")' : "fin de query"}`);
    }
    return advance();
  }

  function parseQuery() {
    if (peek().type === TT.EOF) return { ast: null, orderBy: null };

    let ast = null;
    if (peek().type !== TT.ORDER_BY) {
      ast = parseOrExpr();
    }

    let orderBy = null;
    if (peek().type === TT.ORDER_BY) {
      advance(); // consume ORDER BY
      orderBy = parseOrderList();
    }

    if (peek().type !== TT.EOF) {
      throw new Error(`Token inesperado "${peek().value}" en posición ${peek().pos}`);
    }

    return { ast, orderBy };
  }

  function parseOrExpr() {
    let left = parseAndExpr();
    while (peek().type === TT.OR) {
      advance();
      const right = parseAndExpr();
      left = { type: "OR", left, right };
    }
    return left;
  }

  function parseAndExpr() {
    let left = parseAtom();
    while (peek().type === TT.AND) {
      advance();
      const right = parseAtom();
      left = { type: "AND", left, right };
    }
    return left;
  }

  function parseAtom() {
    if (peek().type === TT.LPAREN) {
      advance();
      const expr = parseOrExpr();
      expect(TT.RPAREN);
      return expr;
    }
    return parseCondition();
  }

  function parseCondition() {
    const fieldToken = expect(TT.FIELD);
    const field = fieldToken.value;

    if (!FIELD_MAP[field]) {
      throw new Error(`Campo desconocido: "${field}". Campos disponibles: ${JQL_FIELDS.filter(f => !f.includes("_")).join(", ")}`);
    }

    const opToken = expect(TT.OP);
    const op = opToken.value;

    // IS EMPTY / IS NOT EMPTY no tienen valor
    if (op === "IS EMPTY" || op === "IS NOT EMPTY") {
      return { type: "CONDITION", field, op, value: null };
    }

    // IN / NOT IN tienen lista entre paréntesis
    if (op === "IN" || op === "NOT IN") {
      expect(TT.LPAREN);
      const values = [];
      values.push(expect(TT.VALUE).value);
      while (peek().type === TT.COMMA) {
        advance();
        values.push(expect(TT.VALUE).value);
      }
      expect(TT.RPAREN);
      return { type: "CONDITION", field, op, value: values };
    }

    // Otros operadores: valor simple
    const valueToken = expect(TT.VALUE);
    return { type: "CONDITION", field, op, value: valueToken.value };
  }

  function parseOrderList() {
    const items = [];
    items.push(parseOrderItem());
    while (peek().type === TT.COMMA) {
      advance();
      items.push(parseOrderItem());
    }
    return items;
  }

  function parseOrderItem() {
    const fieldToken = expect(TT.FIELD);
    let dir = "ASC";
    if (peek().type === TT.ASC) { advance(); dir = "ASC"; }
    else if (peek().type === TT.DESC) { advance(); dir = "DESC"; }
    return { field: fieldToken.value, dir };
  }

  try {
    const result = parseQuery();
    return { ...result, error: null };
  } catch (err) {
    return { ast: null, orderBy: null, error: err.message };
  }
}


// ═══════════════════════════════════════════════════════════════════
//  EVALUATOR (AST → filtrar/ordenar tickets)
// ═══════════════════════════════════════════════════════════════════

/**
 * Resuelve el valor de un campo para un ticket dado.
 * Maneja campos virtuales (project, assignee resuelto, epic resuelto).
 *
 * @param {Object} ticket
 * @param {string} jqlField - Nombre del campo JQL (lowercase)
 * @param {Object} helpers  - { resolveName, resolveEpic, localComments }
 * @returns {*} Valor del campo
 */
function resolveFieldValue(ticket, jqlField, helpers) {
  const mapping = FIELD_MAP[jqlField];
  if (!mapping) return undefined;

  const { field, type } = mapping;

  // Campos virtuales
  if (field === "_project") {
    const key = ticket.jira_key || "";
    const match = key.match(/^([A-Z0-9]+)-/);
    return match ? match[1] : "";
  }

  if (field === "_assignee") {
    return helpers.resolveName?.(ticket.assignee_email) || ticket.assignee_email || "";
  }

  if (field === "_reporter") {
    return helpers.resolveName?.(ticket.reporter_email) || ticket.reporter_email || "";
  }

  if (field === "_epic") {
    const epicObj = helpers.resolveEpic?.(ticket);
    return epicObj?.summary || "";
  }

  // Comentario con override local
  if (field === "comentario") {
    const local = helpers.localComments?.[ticket.jira_key];
    return local !== undefined ? local : (ticket.comentario || "");
  }

  return ticket[field];
}

/**
 * Compara dos valores según el operador JQL.
 *
 * @param {*} fieldVal - Valor del campo del ticket
 * @param {string} op  - Operador JQL
 * @param {*} queryVal - Valor de la query
 * @param {string} fieldType - Tipo del campo: "string", "number", "date", "virtual", "resolved"
 * @returns {boolean}
 */
function compare(fieldVal, op, queryVal, fieldType) {
  // IS EMPTY / IS NOT EMPTY
  if (op === "IS EMPTY") {
    return fieldVal === null || fieldVal === undefined || fieldVal === "" ||
           (Array.isArray(fieldVal) && fieldVal.length === 0);
  }
  if (op === "IS NOT EMPTY") {
    return fieldVal !== null && fieldVal !== undefined && fieldVal !== "" &&
           !(Array.isArray(fieldVal) && fieldVal.length === 0);
  }

  // IN / NOT IN
  if (op === "IN" || op === "NOT IN") {
    const values = Array.isArray(queryVal) ? queryVal : [queryVal];
    const fv = String(fieldVal || "").toLowerCase();
    const match = values.some(v => fv === String(v).toLowerCase());
    return op === "IN" ? match : !match;
  }

  // Normalizar para comparación
  let fv = fieldVal;
  let qv = queryVal;

  if (fieldType === "date") {
    fv = fv ? new Date(fv).getTime() : 0;
    qv = qv ? new Date(qv).getTime() : 0;
  } else if (fieldType === "number") {
    fv = parseFloat(fv) || 0;
    qv = parseFloat(qv) || 0;
  } else {
    fv = String(fv || "").toLowerCase();
    qv = String(qv || "").toLowerCase();
  }

  switch (op) {
    case "=":  return fv === qv;
    case "!=": return fv !== qv;
    case "~":  return String(fv).includes(String(qv));
    case "!~": return !String(fv).includes(String(qv));
    case ">":  return fv > qv;
    case ">=": return fv >= qv;
    case "<":  return fv < qv;
    case "<=": return fv <= qv;
    default:   return false;
  }
}

/**
 * Evalúa un nodo del AST contra un ticket.
 *
 * @param {Object} node    - Nodo del AST
 * @param {Object} ticket  - Ticket Jira
 * @param {Object} helpers - { resolveName, resolveEpic, localComments }
 * @returns {boolean}
 */
function evaluateNode(node, ticket, helpers) {
  if (!node) return true;

  if (node.type === "AND") {
    return evaluateNode(node.left, ticket, helpers) && evaluateNode(node.right, ticket, helpers);
  }

  if (node.type === "OR") {
    return evaluateNode(node.left, ticket, helpers) || evaluateNode(node.right, ticket, helpers);
  }

  if (node.type === "CONDITION") {
    const mapping = FIELD_MAP[node.field];
    const fieldVal = resolveFieldValue(ticket, node.field, helpers);
    return compare(fieldVal, node.op, node.value, mapping?.type || "string");
  }

  return true;
}

/**
 * Resuelve un campo para ORDER BY.
 */
function resolveOrderValue(ticket, jqlField, helpers) {
  const val = resolveFieldValue(ticket, jqlField, helpers);
  const mapping = FIELD_MAP[jqlField];
  if (mapping?.type === "date") return val ? new Date(val).getTime() : 0;
  if (mapping?.type === "number") return parseFloat(val) || 0;
  return String(val || "").toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════
//  API PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

/**
 * Ejecuta una query JQL completa sobre un array de tickets.
 *
 * @param {string} jqlString     - Query JQL del usuario
 * @param {Array}  tickets       - Array de tickets Jira
 * @param {Object} helpers       - { resolveName, resolveEpic, localComments }
 * @returns {{ results: Array, error: string|null, parsedQuery: Object|null }}
 */
export function executeJql(jqlString, tickets, helpers = {}) {
  if (!jqlString || !jqlString.trim()) {
    return { results: tickets, error: null, parsedQuery: null };
  }

  // 1. Tokenizar
  const { tokens, error: tokenError } = tokenize(jqlString);
  if (tokenError) return { results: [], error: tokenError, parsedQuery: null };

  // 2. Parsear
  const { ast, orderBy, error: parseError } = parse(tokens);
  if (parseError) return { results: [], error: parseError, parsedQuery: { ast, orderBy } };

  // 3. Filtrar
  let results = ast ? tickets.filter(t => evaluateNode(ast, t, helpers)) : [...tickets];

  // 4. Ordenar
  if (orderBy && orderBy.length > 0) {
    results.sort((a, b) => {
      for (const { field, dir } of orderBy) {
        const aVal = resolveOrderValue(a, field, helpers);
        const bVal = resolveOrderValue(b, field, helpers);
        if (aVal < bVal) return dir === "ASC" ? -1 : 1;
        if (aVal > bVal) return dir === "ASC" ? 1 : -1;
      }
      return 0;
    });
  }

  return { results, error: null, parsedQuery: { ast, orderBy } };
}

/**
 * Valida una query JQL sin ejecutarla.
 * @param {string} jqlString
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateJql(jqlString) {
  if (!jqlString || !jqlString.trim()) return { valid: true, error: null };
  const { error: tErr } = tokenize(jqlString);
  if (tErr) return { valid: false, error: tErr };
  const { error: pErr } = parse(tokenize(jqlString).tokens);
  if (pErr) return { valid: false, error: pErr };
  return { valid: true, error: null };
}

/**
 * Sugiere autocompletados para el cursor actual.
 * @param {string} input    - Query JQL parcial
 * @param {number} cursor   - Posición del cursor
 * @param {Array}  tickets  - Tickets para extraer valores únicos
 * @param {Object} helpers  - { resolveName, resolveEpic }
 * @returns {{ suggestions: Array<{label: string, value: string, type: string}>, replaceFrom: number, replaceTo: number }}
 */
export function getAutocompleteSuggestions(input, cursor, tickets = [], helpers = {}) {
  const textUpToCursor = input.slice(0, cursor);
  const suggestions = [];

  // Obtener la última "palabra" que el usuario está escribiendo
  const wordMatch = textUpToCursor.match(/([a-zA-Z0-9_\-.]*)$/);
  const currentWord = wordMatch ? wordMatch[1] : "";
  const replaceFrom = cursor - currentWord.length;
  const replaceTo = cursor;

  // Tokenizar lo que hay antes de la palabra actual
  const prefix = textUpToCursor.slice(0, replaceFrom).trimEnd();
  const { tokens: prefixTokens } = tokenize(prefix || "x = x"); // dummy si está vacío

  // Determinar contexto: ¿qué tipo de token se espera?
  const lastToken = prefix ? (() => {
    const { tokens } = tokenize(prefix);
    return tokens.length > 1 ? tokens[tokens.length - 2] : null; // -2 porque el último es EOF
  })() : null;

  // Si no hay nada o el último token es un conector lógico/paréntesis → sugerir campos
  if (!lastToken || lastToken.type === TT.AND || lastToken.type === TT.OR ||
      lastToken.type === TT.LPAREN || lastToken.type === TT.ORDER_BY) {
    const cw = currentWord.toLowerCase();
    // Filtrar campos, mostrar los principales (sin duplicados de alias)
    const mainFields = [
      "project", "key", "summary", "status", "type", "sprint", "assignee",
      "reporter", "priority", "storypoints", "parent", "epic", "labels",
      "created", "updated", "comentario",
    ];
    if (cw.length >= 1) {
      mainFields
        .filter(f => f.startsWith(cw))
        .forEach(f => suggestions.push({ label: f, value: f, type: "field" }));
    } else {
      mainFields.forEach(f => suggestions.push({ label: f, value: f, type: "field" }));
    }
    return { suggestions, replaceFrom, replaceTo };
  }

  // Si el último token es un FIELD → sugerir operadores
  if (lastToken.type === TT.FIELD) {
    const cw = currentWord.toLowerCase();
    const ops = ["=", "!=", "~", "!~", ">", ">=", "<", "<=", "IN", "NOT IN", "IS EMPTY", "IS NOT EMPTY"];
    ops
      .filter(op => !cw || op.toLowerCase().startsWith(cw))
      .forEach(op => suggestions.push({ label: op, value: op, type: "operator" }));
    return { suggestions, replaceFrom, replaceTo };
  }

  // Si el último token es un OP → sugerir valores
  if (lastToken.type === TT.OP) {
    // Encontrar el campo correspondiente (el token antes del operador)
    const { tokens: allTokens } = tokenize(prefix);
    let fieldName = null;
    for (let i = allTokens.length - 2; i >= 0; i--) {
      if (allTokens[i].type === TT.FIELD) { fieldName = allTokens[i].value; break; }
    }

    if (fieldName) {
      return getValueSuggestions(fieldName, currentWord, tickets, helpers, replaceFrom, replaceTo);
    }
  }

  // Si el último token es una COMA (dentro de IN) → sugerir valores
  if (lastToken.type === TT.COMMA || lastToken.type === TT.VALUE) {
    const { tokens: allTokens } = tokenize(prefix);
    let fieldName = null;
    for (let i = allTokens.length - 2; i >= 0; i--) {
      if (allTokens[i].type === TT.FIELD) { fieldName = allTokens[i].value; break; }
    }
    if (fieldName) {
      return getValueSuggestions(fieldName, currentWord, tickets, helpers, replaceFrom, replaceTo);
    }
  }

  return { suggestions, replaceFrom, replaceTo };
}

/**
 * Obtiene sugerencias de valores para un campo específico.
 */
function getValueSuggestions(fieldName, currentWord, tickets, helpers, replaceFrom, replaceTo) {
  const suggestions = [];
  const cw = currentWord.toLowerCase();
  const mapping = FIELD_MAP[fieldName];

  if (!mapping) return { suggestions, replaceFrom, replaceTo };

  // Para claves de ticket (key, issuekey, parent, principal): reglas especiales
  if (mapping.field === "jira_key" || mapping.field === "parent_key") {
    // Necesita al menos: proyecto + primer dígito (ej: "PF3-3") o 2 dígitos
    const pure = cw.replace(/[^a-z0-9\-]/g, "");
    const isProjectPrefix = /^pf3(qa)?-\d/.test(pure);
    const isDigitPrefix = /^\d{2}/.test(pure);

    if (isProjectPrefix || isDigitPrefix) {
      const field = mapping.field === "jira_key" ? "jira_key" : "parent_key";
      const values = [...new Set(tickets.map(t => t[field === "parent_key" ? "jira_key" : field]).filter(Boolean))];
      values
        .filter(v => v.toLowerCase().includes(cw))
        .slice(0, 15)
        .forEach(v => suggestions.push({ label: v, value: `"${v}"`, type: "value" }));
    }
    return { suggestions, replaceFrom, replaceTo };
  }

  // Autocompletado de campos con valores predefinidos
  const acFn = AUTOCOMPLETE_FIELDS[fieldName];
  if (acFn) {
    if (cw.length >= 2 || acFn === AUTOCOMPLETE_FIELDS.project) {
      const values = acFn(tickets);
      values
        .filter(v => !cw || v.toLowerCase().includes(cw))
        .slice(0, 15)
        .forEach(v => {
          const needsQuotes = v.includes(" ");
          suggestions.push({ label: v, value: needsQuotes ? `"${v}"` : v, type: "value" });
        });
    }
    return { suggestions, replaceFrom, replaceTo };
  }

  // assignee/reporter: nombres resueltos
  if (mapping.field === "_assignee" || mapping.field === "_reporter") {
    if (cw.length >= 2) {
      const emailField = mapping.field === "_assignee" ? "assignee_email" : "reporter_email";
      const names = [...new Set(tickets.map(t => helpers.resolveName?.(t[emailField])).filter(v => v && v !== "—"))];
      names
        .filter(n => n.toLowerCase().includes(cw))
        .slice(0, 15)
        .forEach(n => suggestions.push({ label: n, value: `"${n}"`, type: "value" }));
    }
    return { suggestions, replaceFrom, replaceTo };
  }

  // epic: nombres de épicas resueltas
  if (mapping.field === "_epic") {
    if (cw.length >= 2) {
      const epics = [...new Set(tickets.map(t => {
        const e = helpers.resolveEpic?.(t);
        return e?.summary;
      }).filter(Boolean))];
      epics
        .filter(e => e.toLowerCase().includes(cw))
        .slice(0, 15)
        .forEach(e => suggestions.push({ label: e, value: `"${e}"`, type: "value" }));
    }
    return { suggestions, replaceFrom, replaceTo };
  }

  return { suggestions, replaceFrom, replaceTo };
}
