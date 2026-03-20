"use client";

import ReactMarkdown from "react-markdown";
import { formatDate, timeAgo, getStatusColor, getIssueTypeStyle, truncate } from "@/lib/utils";
import { useRole } from "@/app/dashboard/RoleContext";
import { isStory, isSubtask, isEpic, hasStatusHistory } from "./useTicketData";

export default function TicketRow({
  ticket,
  isExpanded,
  onToggleExpand,
  history,
  showAssignee,
  mode,
  resolveEpic,
  resolveName,
  localComments,
  onEditComment,
  subtasksMap = {},
  linksMap = {},
}) {
  const role        = useRole();
  const statusColor = getStatusColor(ticket.status);
  const typeStyle   = getIssueTypeStyle(ticket.issue_type);
  const expanded    = isExpanded;
  const currentComment =
    localComments[ticket.jira_key] !== undefined
      ? localComments[ticket.jira_key]
      : ticket.comentario;

  return (
    <>
      <tr className="ticket-row border-b border-gray-200">

        {/* ── Código (solo errores) ── */}
        {mode === "errores" && (
          <td className="px-4 py-3">
            <a
              href={`https://supervisorservicio2020.atlassian.net/browse/${ticket.jira_key}`}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-md whitespace-nowrap hover:underline hover:text-orange-800"
            >
              {ticket.jira_key}
            </a>
          </td>
        )}

        {/* ── Tipo (no errores) ── */}
        {mode !== "errores" && (
          <td className="px-4 py-3">
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${typeStyle.dot}`} />
              {ticket.issue_type || "—"}
            </span>
          </td>
        )}

        {/* ── Observaciones (no errores) ── */}
        {mode !== "errores" && (
          <td className="px-4 py-3 align-top min-w-[250px]">
            <div className="group relative flex flex-col gap-1">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-gray-700 max-h-[100px] overflow-y-auto prose prose-sm leading-relaxed whitespace-pre-wrap max-w-full break-words">
                  {currentComment ? (
                    <ReactMarkdown>{currentComment}</ReactMarkdown>
                  ) : (
                    <span className="text-gray-400 italic">Sin observaciones...</span>
                  )}
                </div>
                {role !== "viewer" && (
                  <button
                    onClick={() => onEditComment({
                      key: ticket.jira_key,
                      summary: ticket.summary,
                      story_points: ticket.story_points,
                      currentText: currentComment || "",
                    })}
                    className="shrink-0 p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded opacity-0 group-hover:opacity-100 transition-all focus:opacity-100"
                    title="Editar observación"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </td>
        )}

        {/* ── Clave (no errores) ── */}
        {mode !== "errores" && (
          <td className="px-4 py-3">
            <a
              href={`https://supervisorservicio2020.atlassian.net/browse/${ticket.jira_key}`}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-1 rounded-md whitespace-nowrap hover:underline hover:text-orange-800"
            >
              {ticket.jira_key}
            </a>
          </td>
        )}

        {/* ── Resumen (no errores) ── */}
        {mode !== "errores" && (
          <td className="px-4 py-3 text-gray-800 max-w-xs">
            <span title={ticket.summary}>{truncate(ticket.summary, 45)}</span>
          </td>
        )}

        {/* ── Subtareas (no errores) ── */}
        {mode !== "errores" && (
          <td className="px-4 py-3">
            {isStory(ticket.issue_type) && (subtasksMap[ticket.jira_key]?.length > 0) ? (
              <div className="flex flex-wrap gap-1">
                {subtasksMap[ticket.jira_key].map((sk) => (
                  <a
                    key={sk}
                    href={`https://supervisorservicio2020.atlassian.net/browse/${sk}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded hover:underline hover:text-blue-600 hover:bg-blue-50"
                  >
                    {sk}
                  </a>
                ))}
              </div>
            ) : ["Bug", "Error", "Error Desarrollo", "Error Certificación"].includes(ticket.issue_type) ? (
              <span className="text-gray-400 text-xs italic">N/A</span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </td>
        )}

        {/* ── Principal / Actividades vinculadas ── */}
        <td className="px-4 py-3">
          {(isSubtask(ticket.issue_type) || isStory(ticket.issue_type)) && ticket.parent_key ? (
            <a
              href={`https://supervisorservicio2020.atlassian.net/browse/${ticket.parent_key}`}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-md hover:underline hover:text-blue-800"
            >
              {ticket.parent_key}
            </a>
          ) : ["Bug", "Error", "Error Desarrollo", "Error Certificación"].includes(ticket.issue_type) &&
            (linksMap[ticket.jira_key]?.length > 0) ? (
            <div className="flex flex-wrap gap-1">
              {linksMap[ticket.jira_key].map((lk) => (
                <a
                  key={lk}
                  href={`https://supervisorservicio2020.atlassian.net/browse/${lk}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-md hover:underline hover:text-purple-800"
                >
                  {lk}
                </a>
              ))}
            </div>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>

        {/* ── Sprint Historia (solo errores) ── */}
        {mode === "errores" && (
          <td className="px-4 py-3">
            {ticket.storySprint && ticket.storySprint !== "—" ? (
              <span className="text-xs text-gray-700 bg-gray-100 border border-gray-200 px-2 py-1 rounded-md whitespace-nowrap">
                {ticket.storySprint}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </td>
        )}

        {/* ── Épica (no errores) ── */}
        {mode !== "errores" && (
          <td className="px-4 py-3 text-gray-800 max-w-[160px]">
            {(() => {
              const epic = resolveEpic(ticket);
              if (!epic) return <span className="text-gray-300 text-xs">—</span>;
              return (
                <div className="flex flex-col gap-0.5" title={epic.summary}>
                  <a
                    href={`https://supervisorservicio2020.atlassian.net/browse/${epic.key}`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-[10px] text-blue-600 hover:text-blue-800 hover:underline inline-block w-max"
                  >
                    {epic.key}
                  </a>
                  <span className="text-xs truncate block text-gray-700">{epic.summary}</span>
                </div>
              );
            })()}
          </td>
        )}

        {/* ── Sprint (no errores) ── */}
        {mode !== "errores" && (
          <td className="px-4 py-3">
            {ticket.sprint ? (
              <span className="text-xs text-gray-700 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap">
                {ticket.sprint}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </td>
        )}

        {/* ── Asignado ── */}
        {showAssignee && (
          <td className="px-4 py-3">
            <span className="text-gray-600 text-xs">{resolveName(ticket.assignee_email)}</span>
          </td>
        )}

        {/* ── Story Points (no errores, solo Historia) ── */}
        {mode !== "errores" && (
          <td className="px-4 py-3 text-center">
            {isStory(ticket.issue_type) && ticket.story_points != null ? (
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold">
                {ticket.story_points}
              </span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </td>
        )}

        {/* ── Estado ── */}
        <td className="px-4 py-3">
          {isStory(ticket.issue_type) || mode === "errores" ? (
            <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${statusColor.bg} ${statusColor.text}`}>
              {ticket.status}
            </span>
          ) : (
            <span className="text-gray-300 text-xs">—</span>
          )}
        </td>

        {/* ── Informador ── */}
        <td className="px-4 py-3">
          <span className="text-gray-600 text-xs">{resolveName(ticket.reporter_email)}</span>
        </td>

        {/* ── Creada ── */}
        <td className="px-4 py-3">
          <span className="text-gray-400 text-xs whitespace-nowrap" title={formatDate(ticket.created_at)}>
            {mode === "errores" ? formatDate(ticket.created_at) : timeAgo(ticket.created_at)}
          </span>
        </td>

        {/* ── Historial (no errores) ── */}
        {mode !== "errores" && (
          <td className="text-center px-4 py-3">
            {hasStatusHistory(ticket.issue_type) && history.length > 0 ? (
              <button
                onClick={() => onToggleExpand(ticket.jira_key)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition-colors ${
                  expanded
                    ? "bg-orange-50 text-orange-600 border border-orange-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {history.length}
              </button>
            ) : hasStatusHistory(ticket.issue_type) ? (
              <span className="text-gray-300 text-xs">0</span>
            ) : (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </td>
        )}
      </tr>

      {/* ── Fila expandida: historial de estados ── */}
      {expanded && history.length > 0 && (
        <tr className="bg-gray-50/50">
          <td colSpan={12} className="px-6 py-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Historial de estados — {ticket.jira_key}
              </p>
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-gray-400 w-28 shrink-0">{formatDate(h.changed_at)}</span>
                    <div className="flex items-center gap-2">
                      {h.old_status ? (
                        <>
                          <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">{h.old_status}</span>
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                          </svg>
                        </>
                      ) : (
                        <span className="text-gray-400 italic">Nuevo</span>
                      )}
                      <span className="px-2 py-0.5 rounded bg-orange-50 text-orange-700 font-medium">{h.new_status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
