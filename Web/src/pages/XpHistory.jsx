import { useMemo, useState } from "react";
import { BookOpen, CheckSquare, Clock, HelpCircle, Layers, NotebookPen, Target } from "lucide-react";
import { useApp } from "../context.js";
import { addDays, formatFull, formatMonth, todayIso } from "../lib/dates.js";
import { progressOf, subjectById } from "../lib/domain.js";
import { Empty, Segmented, SubjectTag } from "../ui.jsx";

const kinds = {
  aula: { label: "Aulas", icon: NotebookPen },
  falta: { label: "Faltas recuperadas", icon: BookOpen },
  ritual: { label: "Ritual de Foco", icon: Clock },
  simulado: { label: "Simulados", icon: HelpCircle },
  carta: { label: "Cartas do Saber", icon: Layers },
  assunto: { label: "Assuntos de prova", icon: Target },
  atividade: { label: "Atividades", icon: CheckSquare },
};
const dateLabels = { aula: "dia da aula", sessao: "dia da sessão", simulado: "dia do simulado", "ultima-revisao": "última revisão" };

// Cada linha é um registro que existe hoje, com o XP que ele vale pelas regras do perfil.
// A soma das linhas é o XP total. Quando o registro não guarda o dia do ganho, a linha aparece em "Sem data".
export default function XpHistory() {
  const { data, go } = useApp();
  const today = todayIso();
  const progress = useMemo(() => progressOf(data, today), [data, today]);
  const [kind, setKind] = useState("");
  const entries = progress.history.filter((entry) => !kind || entry.kind === kind);
  const sum = (list) => list.reduce((total, entry) => total + entry.xp, 0);
  const weekFrom = addDays(today, -6);
  const monthKey = today.slice(0, 7);
  const dated = progress.history.filter((entry) => entry.date && entry.dateKind !== "ultima-revisao");
  const groups = useMemo(() => {
    const map = new Map();
    for (const entry of entries) {
      const key = entry.date ? entry.date.slice(0, 7) : "sem-data";
      map.set(key, [...(map.get(key) || []), entry]);
    }
    return [...map.entries()].sort((a, b) => (a[0] === "sem-data" ? 1 : b[0] === "sem-data" ? -1 : b[0].localeCompare(a[0])));
  }, [entries]);
  const kindsPresent = Object.keys(kinds).filter((id) => progress.history.some((entry) => entry.kind === id));

  return (
    <div className="page xp-history">
      <header className="page-head">
        <div>
          <h1>Histórico de XP</h1>
          <p>De onde veio cada ponto, a partir dos seus registros.</p>
        </div>
      </header>

      <dl className="xp-summary">
        <div>
          <dt>XP total</dt>
          <dd>{progress.xp.toLocaleString("pt-BR")}</dd>
        </div>
        <div>
          <dt>Últimos 7 dias</dt>
          <dd>{sum(dated.filter((entry) => entry.date >= weekFrom && entry.date <= today)).toLocaleString("pt-BR")}</dd>
        </div>
        <div>
          <dt>{formatMonth(today)}</dt>
          <dd>{sum(dated.filter((entry) => entry.date.startsWith(monthKey))).toLocaleString("pt-BR")}</dd>
        </div>
        <div>
          <dt>Nível</dt>
          <dd>
            {progress.level} · {progress.title}
          </dd>
        </div>
      </dl>
      <p className="hint">Os períodos somam só ganhos com data registrada (aulas, sessões e simulados). Revisões de cartas, assuntos e atividades entram no total, mas não guardam o dia.</p>

      {kindsPresent.length > 1 && (
        <Segmented label="Filtrar por origem" value={kind} onChange={setKind} options={[["", "Tudo"], ...kindsPresent.map((id) => [id, kinds[id].label])]} />
      )}

      {groups.length ? (
        groups.map(([key, list]) => (
          <section key={key} aria-labelledby={`xp-${key}`}>
            <div className="section-head">
              <h2 className="section-title" id={`xp-${key}`}>
                {key === "sem-data" ? "Sem data registrada" : formatMonth(`${key}-01`)}
              </h2>
              <span className="xp-group-total">+{sum(list).toLocaleString("pt-BR")} XP</span>
            </div>
            <ul className="group xp-list">
              {list.map((entry) => {
                const Icon = kinds[entry.kind].icon;
                const subject = subjectById(data.subjects, entry.subjectId);
                return (
                  <li key={entry.id} className="row">
                    <Icon size={17} className="row-icon" aria-hidden="true" />
                    <span className="row-main">
                      <strong>{entry.text}</strong>
                      <small>
                        {entry.date ? `${formatFull(entry.date)} (${dateLabels[entry.dateKind] || "data"})` : "sem data do ganho"}
                        {subject ? " · " : ""}
                        {subject && <SubjectTag subject={subject} small />}
                      </small>
                    </span>
                    <strong className="xp-amount">+{entry.xp}</strong>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      ) : (
        <Empty title="Nenhum XP ainda" mood="sleepy" action={<button className="btn primary" onClick={() => go("aulas")}>Registrar uma aula</button>}>
          Registre uma aula, salve um Ritual de Foco ou revise uma carta: o primeiro XP aparece aqui na hora.
        </Empty>
      )}
      <p className="footnote">
        Atualizar a página ou reenviar um pedido não cria XP: o total é recalculado dos registros, e cada registro vale uma vez. Se você apagar um registro, o XP dele sai do histórico.
      </p>
    </div>
  );
}
