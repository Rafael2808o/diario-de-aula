import { useMemo, useState } from "react";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useApp } from "../context.js";
import { addDays, classOccurrences, formatFull, formatShort, startOfWeek, todayIso } from "../lib/dates.js";
import { subjectById } from "../lib/domain.js";
import { Empty } from "../ui.jsx";

// Cada indicador mostra o número e, ao abrir, os registros que o originaram. Sem dados, explica quando vai aparecer.
function Indicator({ title, value, empty, children, open, onToggle }) {
  const id = `ind-${title.replace(/\W+/g, "-")}`;
  return (
    <li className={`indicator ${open ? "is-open" : ""}`}>
      <button type="button" className="row" aria-expanded={open} aria-controls={id} onClick={onToggle} disabled={value === null}>
        <span className="row-main">
          <strong>{title}</strong>
          {value === null && <small>{empty}</small>}
        </span>
        {value !== null && <span className="indicator-value">{value}</span>}
        {value !== null && <ChevronDown size={16} className="chevron" aria-hidden="true" />}
      </button>
      {open && value !== null && (
        <div className="indicator-detail" id={id}>
          {children}
        </div>
      )}
    </li>
  );
}

function WeeklyBars({ weeks }) {
  const max = Math.max(1, ...weeks.map((week) => week.count));
  const [hover, setHover] = useState(null);
  return (
    <figure className="bars">
      <figcaption>Aulas registradas por semana, nas últimas 8 semanas</figcaption>
      <div className="bars-plot" role="img" aria-label={weeks.map((week) => `semana de ${formatShort(week.start)}: ${week.count}`).join("; ")}>
        {weeks.map((week, index) => (
          <div
            key={week.start}
            className="bar-slot"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(index)}
            onBlur={() => setHover(null)}
            tabIndex={0}
          >
            {hover === index && (
              <span className="bar-tip">
                {week.count} {week.count === 1 ? "aula" : "aulas"}
              </span>
            )}
            <span className="bar" style={{ height: `${(week.count / max) * 100}%` }} />
            <small>{formatShort(week.start)}</small>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Aulas registradas por semana</caption>
        <tbody>
          {weeks.map((week) => (
            <tr key={week.start}>
              <th>Semana de {formatFull(week.start)}</th>
              <td>{week.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export default function History() {
  const { data, user, go } = useApp();
  const [open, setOpen] = useState(null);
  const today = todayIso();
  const toggle = (key) => setOpen((current) => (current === key ? null : key));
  const name = (subjectId) => subjectById(data.subjects, subjectId)?.name || "Sem disciplina";

  const stats = useMemo(() => {
    // Pendências olham as últimas três semanas, como em Dias de aula; aulas antigas sem registro não viram cobrança.
    const past = classOccurrences(data.subjects, data.lessons, user, addDays(today, -21), today);
    const registered = data.lessons.filter((lesson) => lesson.status === "presente" && !lesson.draft);
    const unregistered = past.filter((item) => !item.lesson);
    const lowMastery = data.lessons.filter((lesson) => lesson.mastery && lesson.mastery <= 2);
    const missed = data.lessons.filter((lesson) => lesson.status === "falta" && !lesson.recovered);
    const pendingTopics = data.exams.filter((exam) => exam.date >= today).flatMap((exam) => exam.topics.filter((topic) => topic.status === "Não iniciado" || topic.status === "Em estudo").map((topic) => ({ ...topic, exam })));
    const futureExams = data.exams.filter((exam) => exam.date >= today);
    const doneTasks = data.tasks.filter((task) => task.done);
    const results = data["quiz-results"];
    const errorsByTopic = Object.values(
      results.reduce((map, result) => {
        const key = `${result.subjectId}|${(result.topic || "Sem assunto").toLowerCase()}`;
        map[key] ||= { topic: result.topic || "Sem assunto", subjectId: result.subjectId, wrong: 0, total: 0 };
        map[key].wrong += result.total - result.correct;
        map[key].total += result.total;
        return map;
      }, {}),
    )
      .filter((item) => item.wrong > 0)
      .sort((a, b) => b.wrong / b.total - a.wrong / a.total);
    const weekStart = startOfWeek(today);
    const weeks = Array.from({ length: 8 }, (_, index) => {
      const start = addDays(weekStart, (index - 7) * 7);
      const end = addDays(start, 6);
      return { start, count: data.lessons.filter((lesson) => lesson.status === "presente" && lesson.date >= start && lesson.date <= end).length };
    });
    return { past, registered, unregistered, lowMastery, missed, pendingTopics, futureExams, doneTasks, results, errorsByTopic, weeks };
  }, [data, user, today]);

  const nothing = !data.lessons.length && !data.exams.length && !data.tasks.length && !stats.results.length;
  const review = stats.lowMastery.length + stats.missed.length + stats.pendingTopics.length;
  const average = stats.results.length ? Math.round((stats.results.reduce((sum, result) => sum + result.correct / result.total, 0) / stats.results.length) * 100) : 0;

  return (
    <div className="page history">
      <button className="link-btn back" onClick={() => go("inicio")}>
        <ArrowLeft size={15} /> Início
      </button>
      <header className="page-head">
        <div>
          <h1>Histórico de aprendizagem</h1>
          <p>Sua evolução no semestre, calculada só com o que você registrou. Toque em um indicador para ver os registros.</p>
        </div>
      </header>

      {nothing ? (
        <Empty title="Ainda não há histórico.">Os indicadores aparecem conforme você registra aulas, cadastra provas e faz simulados.</Empty>
      ) : (
        <>
          <ul className="group indicators">
            <Indicator
              title="Aulas registradas"
              value={stats.past.length || stats.registered.length ? `${stats.registered.length} registradas, ${stats.unregistered.length} pendentes` : null}
              empty="Aparece quando suas disciplinas tiverem horários dentro do semestre letivo."
              open={open === "aulas"}
              onToggle={() => toggle("aulas")}
            >
              {stats.unregistered.length ? (
                <>
                  <p className="hint">Aulas das últimas três semanas ainda sem registro:</p>
                  <ul className="plain-list">
                    {stats.unregistered.slice(-12).reverse().map((item) => (
                      <li key={item.key}>
                        <button className="link-btn" onClick={() => go("aulas", { date: item.date })}>
                          {item.subject.name}, {formatFull(item.date)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="hint">Todas as aulas das últimas três semanas têm registro.</p>
              )}
            </Indicator>
            <Indicator title="Conteúdos para revisar" value={review ? review : data.lessons.length || data.exams.length ? 0 : null} empty="Aparece quando você marcar domínio nas aulas ou tiver provas com assuntos." open={open === "revisar"} onToggle={() => toggle("revisar")}>
              <ul className="plain-list">
                {stats.pendingTopics.map((topic) => (
                  <li key={`${topic.exam.id}-${topic.id}`}>
                    <button className="link-btn" onClick={() => go("provas", { id: topic.exam.id })}>
                      {topic.title}
                    </button>{" "}
                    ({topic.exam.title}, {topic.status.toLowerCase()})
                  </li>
                ))}
                {stats.lowMastery.map((lesson) => (
                  <li key={lesson.id}>
                    <button className="link-btn" onClick={() => go("aulas", { lesson: lesson.id })}>
                      {lesson.theme || "Aula sem tema"}
                    </button>{" "}
                    ({name(lesson.subjectId)}, domínio {lesson.mastery} de 5)
                  </li>
                ))}
                {stats.missed.map((lesson) => (
                  <li key={lesson.id}>
                    <button className="link-btn" onClick={() => go("aulas", { lesson: lesson.id })}>
                      Falta em {formatFull(lesson.date)}
                    </button>{" "}
                    ({name(lesson.subjectId)}, conteúdo ainda não recuperado)
                  </li>
                ))}
              </ul>
              {!review && <p className="hint">Nada pendente agora.</p>}
            </Indicator>
            <Indicator title="Provas futuras" value={data.exams.length ? stats.futureExams.length : null} empty="Aparece quando você cadastrar uma prova." open={open === "provas"} onToggle={() => toggle("provas")}>
              <ul className="plain-list">
                {stats.futureExams.map((exam) => (
                  <li key={exam.id}>
                    <button className="link-btn" onClick={() => go("provas", { id: exam.id })}>
                      {exam.title}
                    </button>{" "}
                    ({name(exam.subjectId)}, {formatFull(exam.date)})
                  </li>
                ))}
              </ul>
            </Indicator>
            <Indicator title="Tarefas concluídas" value={data.tasks.length ? `${stats.doneTasks.length} de ${data.tasks.length}` : null} empty="Aparece quando você cadastrar atividades." open={open === "tarefas"} onToggle={() => toggle("tarefas")}>
              <ul className="plain-list">
                {stats.doneTasks.map((task) => (
                  <li key={task.id}>
                    {task.title} ({name(task.subjectId)}, prazo {formatFull(task.dueDate)})
                  </li>
                ))}
              </ul>
            </Indicator>
            <Indicator title="Resultados dos simulados" value={stats.results.length ? `${average}% de acerto médio` : null} empty="Aparece depois do seu primeiro simulado em Estudar com IA." open={open === "simulados"} onToggle={() => toggle("simulados")}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Disciplina</th>
                    <th>Assunto</th>
                    <th>Acertos</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.results.map((result) => (
                    <tr key={result.id}>
                      <td>{formatFull(result.takenOn)}</td>
                      <td>{name(result.subjectId)}</td>
                      <td>{result.topic || "–"}</td>
                      <td>
                        {result.correct} de {result.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Indicator>
            <Indicator title="Assuntos com mais erros" value={stats.results.length ? stats.errorsByTopic.length : null} empty="Aparece depois dos simulados." open={open === "erros"} onToggle={() => toggle("erros")}>
              {stats.errorsByTopic.length ? (
                <ul className="plain-list">
                  {stats.errorsByTopic.map((item) => (
                    <li key={`${item.subjectId}-${item.topic}`}>
                      {item.topic} ({name(item.subjectId)}): errou {item.wrong} de {item.total} questões
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">Nenhum erro nos simulados feitos.</p>
              )}
            </Indicator>
          </ul>

          <section>
            <h2 className="section-title">Evolução</h2>
            {stats.weeks.some((week) => week.count) ? <WeeklyBars weeks={stats.weeks} /> : <p className="quiet">O gráfico aparece quando houver aulas registradas nas últimas semanas.</p>}
          </section>
          <p className="footnote">Este histórico mostra a sua evolução. Ele não compara você com outras pessoas.</p>
        </>
      )}
    </div>
  );
}
