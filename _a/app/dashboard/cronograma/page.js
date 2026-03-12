import { cronogramaData, formatCronogramaDate } from "@/lib/cronogramaData";

export default function CronogramaPage() {
    return (
        <div className="space-y-6">
            <div className="animate-fade-in">
                <h1 className="text-2xl md:text-3xl font-bold font-[family-name:var(--font-heading)] text-gray-900">
                    Cronograma de Sprints
                </h1>
                <p className="text-gray-500 mt-1">
                    Calendario oficial de iteraciones, desarrollo y entregables (PF3)
                </p>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden animate-fade-in">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm whitespace-nowrap">
                        <thead>
                            <tr className="bg-[#b7e1cd] border-b-2 border-[#8db19f]">
                                <th className="px-3 py-3 text-center border-r border-[#8db19f] font-semibold text-gray-900">Nº</th>
                                <th className="px-4 py-3 text-left border-r border-[#8db19f] font-semibold text-gray-900">Etapa</th>
                                <th className="px-4 py-3 text-center border-r border-[#8db19f] font-semibold text-gray-900">Iteración</th>
                                <th className="px-3 py-3 text-center border-r border-[#8db19f] font-semibold text-gray-900">Duración</th>
                                <th className="px-3 py-3 text-center border-r border-[#8db19f] font-semibold text-gray-900">Duración<br />Acumulada</th>
                                <th className="px-4 py-3 text-center border-r border-[#8db19f] font-semibold text-gray-900">Fecha de inicio del<br />Sprint (iteración)</th>
                                <th className="px-4 py-3 text-center border-r border-[#8db19f] font-semibold text-gray-900">Fecha de fin del<br />Sprint (iteración)</th>
                                <th className="px-4 py-3 text-center border-r border-[#8db19f] font-semibold text-gray-900">Plazo de presentación<br />de entregable</th>
                                <th className="px-4 py-3 text-center font-semibold text-gray-900">Fecha máxima<br />de presentación<br />del entregable</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cronogramaData.map((row, index) => (
                                <tr key={row.no} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                                    <td className="px-3 py-2.5 text-center border-r border-gray-200 text-gray-800">{row.no}</td>
                                    <td className="px-4 py-2.5 text-left border-r border-gray-200 text-gray-800">{row.etapa}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-gray-200 text-gray-800">{row.iteracion}</td>
                                    <td className="px-3 py-2.5 text-center border-r border-gray-200 text-gray-800">{row.duracion}</td>
                                    <td className="px-3 py-2.5 text-center border-r border-gray-200 text-gray-800">{row.duracionAcumulada}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-gray-200 text-gray-800">{formatCronogramaDate(row.fechaInicio)}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-gray-200 text-gray-800">{formatCronogramaDate(row.fechaFin)}</td>
                                    <td className="px-4 py-2.5 text-center border-r border-gray-200 text-gray-800">{row.plazoPresentacion || ""}</td>
                                    <td className="px-4 py-2.5 text-center text-gray-800 font-medium">
                                        {row.fechaMaxima ? (
                                            (() => {
                                                const [y, m, d] = row.fechaMaxima.split("-");
                                                return `${d}/${m}/${y}`;
                                            })()
                                        ) : ""}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
