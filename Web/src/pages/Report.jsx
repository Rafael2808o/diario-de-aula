import { useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { useApp } from "../context.js";
import { addMonths, endOfMonth, formatMonth, range, startOfMonth, todayIso } from "../lib/dates.js";
import { formatDuration } from "../lib/ritual.js";
import { Empty } from "../ui.jsx";

// Relatório mensal: só as sessões salvas no Ritual (tempo válido, sem o período com o app fechado).
function monthStats(sessions, subjects, month) {
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  const inMonth = sessions.filter((session) => session.date >= from && session.date <= to);
  const total = inMonth.reduce((sum, session) => sum + (session.durationSeconds || 0), 0);
  const bySubject = new Map();
  for (const session of inMonth) {
    const key = session.subjectId || "";
    bySubject.set(key, (bySubject.get(key) || 0) + (session.durationSeconds || 0));
  }
  const ranking = [...bySubject]
    .map(([id, seconds]) => ({ id, seconds, subject: subjects.find((item) => item.id === id) || null }))
    .sort((a, b) => b.seconds - a.seconds);
  const days = range(from, to).map((date) => ({ date, seconds: inMonth.filter((session) => session.date === date).reduce((sum, session) => sum + (session.durationSeconds || 0), 0) }));
  return { total, ranking, days, count: inMonth.length, activeDays: days.filter((day) => day.seconds > 0).length };
}

const minutesLabel = (seconds) => (seconds ? formatDuration(seconds) : "—");

export default function Report() {
  const { data, go } = useApp();
  const today = todayIso();
  const [month, setMonth] = useState(startOfMonth(today));
  const sessions = data["study-sessions"];
  const stats = useMemo(() => monthStats(sessions, data.subjects, month), [sessions, data.subjects, month]);
  const previous = useMemo(() => monthStats(sessions, data.subjects, addMonths(month, -1)), [sessions, data.subjects, month]);
  const maxDay = Math.max(1, ...stats.days.map((day) => day.seconds));
  const maxSubject = Math.max(1, ...stats.ranking.map((item) => item.seconds));
  const diff = stats.total - previous.total;
  const isCurrent = month === startOfMonth(today);

  return (
    <div className="page report">
      <button className="link-btn back" onClick={() => go("historico")}>
        <ArrowLeft size={15} /> Histórico de estudos
      </button>
      <div className="report-month">
        <button type="button" className="icon-btn" aria-label="Mês anterior" onClick={() => setMonth(addMonths(month, -1))}>
          <ChevronLeft size={18} />
        </button>
        <h2>{formatMonth(month)}</h2>
        <button type="button" className="icon-btn" aria-label="Próximo mês" disabled={isCurrent} onClick={() => setMonth(addMonths(month, 1))}>
          <ChevronRight size={18} />
        </button>
      </div>

      {stats.total === 0 ? (
        <Empty title="Nenhuma sessão do Ritual neste mês." mood="sleepy">
          O relatório usa só o tempo salvo no Ritual de Foco. Comece uma sessão e salve no histórico para ela aparecer aqui.
        </Empty>
      ) : (
        <>
          <div className="report-tiles">
            <div className="report-tile">
              <small>Tempo total estudado</small>
              <strong>{minutesLabel(stats.total)}</strong>
              <span className="hint">
                {previous.total ? `${diff >= 0 ? "+" : "−"}${minutesLabel(Math.abs(diff))} em relação a ${formatMonth(addMonths(month, -1)).split(" ")[0]}` : "Primeiro mês com sessões salvas"}
              </span>
            </div>
            <div className="report-tile">
              <small>Sessões</small>
              <strong>{stats.count}</strong>
              <span className="hint">em {stats.activeDays} {stats.activeDays === 1 ? "dia" : "dias"}</span>
            </div>
            <div className="report-tile">
              <small>Matéria mais estudada</small>
              <strong>{stats.ranking[0].subject?.name || "Sem disciplina"}</strong>
              <span className="hint">{Math.round((stats.ranking[0].seconds / stats.total) * 100)}% do tempo do mês</span>
            </div>
          </div>

          <section className="report-section">
            <h3 className="section-title">Tempo por disciplina</h3>
            <ol className="report-bars" aria-label="Disciplinas da mais estudada para a menos estudada">
              {stats.ranking.map((item, index) => (
                <li key={item.id || "sem"} title={`${item.subject?.name || "Sem disciplina"}: ${minutesLabel(item.seconds)}`}>
                  <span className="report-bar-label">
                    <span className="report-rank">{index + 1}º</span> {item.subject?.name || "Sem disciplina"}
                  </span>
                  <span className="report-bar-track">
                    <span className="report-bar" style={{ width: `${Math.max(2, (item.seconds / maxSubject) * 100)}%`, "--bar": item.subject?.color || "var(--accent)" }} />
                  </span>
                  <span className="report-bar-value">
                    {minutesLabel(item.seconds)} <small>· {Math.round((item.seconds / stats.total) * 100)}%</small>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section className="report-section">
            <h3 className="section-title">Minutos por dia</h3>
            <div className="report-days" role="img" aria-label={`Minutos estudados por dia em ${formatMonth(month)}. Maior dia: ${minutesLabel(maxDay)}.`}>
              {stats.days.map((day) => (
                <span key={day.date} className="report-day" title={`${Number(day.date.slice(8))}/${day.date.slice(5, 7)}: ${day.seconds ? minutesLabel(day.seconds) : "sem estudo"}`}>
                  <span className="report-day-bar" style={{ height: `${day.seconds ? Math.max(4, (day.seconds / maxDay) * 100) : 0}%` }} />
                  <small>{Number(day.date.slice(8)) % 5 === 1 || day.date.slice(8) === "01" ? Number(day.date.slice(8)) : ""}</small>
                </span>
              ))}
            </div>
            <p className="hint">Maior dia: {minutesLabel(maxDay)}. Passe o dedo ou o mouse sobre uma barra para ver o dia.</p>
          </section>

          <details className="report-table">
            <summary>Ver em tabela</summary>
            <table>
              <thead>
                <tr>
                  <th>Disciplina</th>
                  <th>Este mês</th>
                  <th>Mês anterior</th>
                </tr>
              </thead>
              <tbody>
                {stats.ranking.map((item) => (
                  <tr key={item.id || "sem"}>
                    <td>{item.subject?.name || "Sem disciplina"}</td>
                    <td>{minutesLabel(item.seconds)}</td>
                    <td>{minutesLabel(previous.ranking.find((other) => other.id === item.id)?.seconds || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  );
}
