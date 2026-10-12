import { useMemo, useState } from "react";
import { BookOpen, CalendarPlus, Check, CircleHelp, Layers, ListChecks, NotebookText } from "lucide-react";
import { useApp } from "../../context.js";
import { countdown, formatFull, formatLong, todayIso } from "../../lib/dates.js";
import { lessonsMentioning, subjectById } from "../../lib/domain.js";
import { buildStudyPlan } from "../../lib/plan.js";
import { Empty, FormError } from "../../ui.jsx";

const topicStates = ["Não iniciado", "Em estudo", "Revisado", "Dominado"];

export function ExamPicker({ value, onChange }) {
  const { data, go } = useApp();
  const today = todayIso();
  const upcoming = data.exams.filter((exam) => exam.date >= today);
  if (!upcoming.length) {
    return (
      <Empty compact title="Nenhuma prova futura cadastrada.">
        Cadastre a avaliação com a data e os assuntos que o professor confirmou.
        <button className="btn small" onClick={() => go("provas")}>
          Ir para Provas
        </button>
      </Empty>
    );
  }
  return (
    <label className="inline-field exam-picker">
      Prova
      <select value={value || ""} onChange={(event) => onChange(event.target.value)}>
        <option value="" disabled>
          Escolha a avaliação
        </option>
        {upcoming.map((exam) => (
          <option key={exam.id} value={exam.id}>
            {exam.title}, {subjectById(data.subjects, exam.subjectId)?.name}, {countdown(exam.date, today)}
          </option>
        ))}
      </select>
    </label>
  );
}

// Mostra o cronograma calculado e grava as sessões como eventos "Sessão de estudo" ligados à prova.
export function PlanBuilder({ exam }) {
  const { data, user, create, remove, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = useMemo(() => buildStudyPlan({ exam, lessons: data.lessons, user }), [exam, data.lessons, user]);
  const existing = data.events.filter((event) => event.examId === exam.id && event.kind === "Sessão de estudo");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      for (const event of existing) await remove("events", event.id);
      for (const session of plan.sessions) {
        await create("events", {
          title: session.title,
          kind: "Sessão de estudo",
          subjectId: exam.subjectId,
          examId: exam.id,
          date: session.date,
          startTime: session.startTime,
          endTime: session.endTime,
          notes: session.notes,
          reminderMinutes: session.startTime ? 15 : 0,
        });
      }
      toast(`${plan.sessions.length} ${plan.sessions.length === 1 ? "sessão adicionada" : "sessões adicionadas"} ao calendário.`);
    } catch (failure) {
      setError(`O plano foi salvo só em parte: ${failure.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="plan">
      {plan.warnings.map((warning) => (
        <p key={warning} className={warning.startsWith("O tempo não cobre") || warning.startsWith("Não há dias") ? "warning" : "hint"}>
          {warning}
        </p>
      ))}
      {plan.sessions.length > 0 && (
        <>
          <ul className="group">
            {plan.sessions.map((session) => (
              <li key={session.date} className="row plan-row">
                <span className="row-time">{formatFull(session.date).slice(0, 5)}</span>
                <span className="row-main">
                  <strong>{session.title}</strong>
                  <small>
                    {session.startTime ? `${session.startTime} às ${session.endTime}` : "Sem horário fixo"}, {session.minutes} min
                  </small>
                </span>
              </li>
            ))}
          </ul>
          <FormError>{error}</FormError>
          <div className="form-actions">
            <button className="btn primary" disabled={busy} onClick={save}>
              <CalendarPlus size={16} /> {busy ? "Salvando..." : existing.length ? "Substituir o plano no calendário" : "Adicionar ao calendário"}
            </button>
          </div>
          {existing.length > 0 && <p className="footnote">Já existem {existing.length} sessões deste plano no calendário. Substituir apaga as antigas.</p>}
        </>
      )}
    </div>
  );
}

const Step = ({ number, title, done, children }) => (
  <li className={`step ${done ? "is-done" : ""}`}>
    <span className="step-mark" aria-hidden="true">
      {done ? <Check size={14} /> : number}
    </span>
    <div>
      <h4>
        {title}
        {done && <span className="sr-only"> (concluído)</span>}
      </h4>
      {children}
    </div>
  </li>
);

// Roteiro guiado da Ferramenta F. Cada etapa usa só o que o aluno registrou.
export function Rescue({ examId, setExamId, onTool }) {
  const { data, go, update, toast } = useApp();
  const exam = data.exams.find((item) => item.id === examId);
  const today = todayIso();
  if (!exam) return <ExamPicker value={examId} onChange={setExamId} />;
  const subject = subjectById(data.subjects, exam.subjectId);
  const pending = exam.topics.filter((topic) => topic.status === "Não iniciado" || topic.status === "Em estudo");
  const materials = data.materials.filter((material) => material.examId === exam.id || material.subjectId === exam.subjectId);
  const sessions = data.events.filter((event) => event.examId === exam.id && event.kind === "Sessão de estudo");
  const mistakes = data["quiz-results"].filter((result) => result.subjectId === exam.subjectId).flatMap((result) => result.mistakes);
  const preset = { subjectId: exam.subjectId, examId: exam.id, topic: pending[0]?.title || exam.topics[0]?.title || "" };
  const setTopic = (topicId, status) => update("exams", exam.id, { topics: exam.topics.map((topic) => (topic.id === topicId ? { ...topic, status } : topic)) }).catch((error) => toast(error.message));

  return (
    <div className="rescue">
      <div className="toolbar">
        <ExamPicker value={examId} onChange={setExamId} />
        <span className="rescue-when">
          {subject?.name}, {formatLong(exam.date)} ({countdown(exam.date, today)})
        </span>
      </div>
      <ol className="steps-list">
        <Step number={1} title="Conteúdos confirmados" done={exam.topics.length > 0}>
          {exam.topics.length ? (
            <p>{exam.topics.map((topic) => topic.title).join(", ")}.</p>
          ) : (
            <p className="warning">
              Esta prova ainda não tem assuntos. O Lúmina não adivinha o que vai cair.{" "}
              <button className="link-btn" onClick={() => go("provas", { id: exam.id })}>
                Informar assuntos
              </button>
            </p>
          )}
        </Step>
        <Step number={2} title="Aulas e materiais de cada assunto" done={exam.topics.length > 0}>
          <ul className="plain-list">
            {exam.topics.map((topic) => {
              const lessons = lessonsMentioning(data.lessons, exam.subjectId, topic.title);
              return (
                <li key={topic.id}>
                  <strong>{topic.title}:</strong>{" "}
                  {lessons.length
                    ? lessons.map((lesson, index) => (
                        <button key={lesson.id} className="link-btn" onClick={() => go("aulas", { lesson: lesson.id })}>
                          {index ? ", " : ""}aula de {formatFull(lesson.date)}
                        </button>
                      ))
                    : "nenhuma aula registrada cita este assunto."}
                </li>
              );
            })}
          </ul>
          <p className="hint">
            {materials.length} {materials.length === 1 ? "material" : "materiais"} desta disciplina.{" "}
            <button className="link-btn" onClick={() => go("conteudos", { id: exam.subjectId, tab: "materiais" })}>
              Abrir materiais
            </button>
          </p>
        </Step>
        <Step number={3} title="O que ainda não foi estudado" done={exam.topics.length > 0 && !pending.length}>
          {exam.topics.length ? (
            <ul className="topic-status">
              {exam.topics.map((topic) => (
                <li key={topic.id}>
                  <span>{topic.title}</span>
                  <select aria-label={`Situação de ${topic.title}`} value={topic.status} onChange={(event) => setTopic(topic.id, event.target.value)}>
                    {topicStates.map((state) => (
                      <option key={state}>{state}</option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Aparece quando a prova tiver assuntos.</p>
          )}
        </Step>
        <Step number={4} title="Organizar pelo tempo que você tem" done={sessions.length > 0}>
          <PlanBuilder exam={exam} />
        </Step>
        <Step number={5} title="Resumos e exercícios">
          <div className="form-actions">
            <button className="btn small" onClick={() => onTool("resumo", preset)}>
              <NotebookText size={14} /> Resumir as aulas
            </button>
            <button className="btn small" onClick={() => onTool("simulado", preset)}>
              <CircleHelp size={14} /> Fazer um simulado
            </button>
            <button className="btn small" onClick={() => onTool("flashcards", preset)}>
              <Layers size={14} /> Flashcards
            </button>
          </div>
        </Step>
        <Step number={6} title="Acompanhar o progresso" done={sessions.length > 0 && sessions.every((session) => session.done)}>
          <p>
            {exam.topics.filter((topic) => topic.status === "Revisado" || topic.status === "Dominado").length} de {exam.topics.length} assuntos revisados.{" "}
            {sessions.length ? `${sessions.filter((session) => session.done).length} de ${sessions.length} sessões do plano concluídas.` : "Nenhuma sessão de estudo marcada ainda."}
          </p>
        </Step>
        <Step number={7} title="Revisão final">
          {pending.length || mistakes.length ? (
            <ul className="plain-list">
              {pending.map((topic) => (
                <li key={topic.id}>
                  <ListChecks size={14} aria-hidden="true" /> Revisar {topic.title}
                </li>
              ))}
              {mistakes.slice(0, 5).map((mistake, index) => (
                <li key={index}>
                  <BookOpen size={14} aria-hidden="true" /> Questão errada: {mistake.question} (correta: {mistake.correct})
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Sem pendências registradas. Releia as orientações do professor antes da prova.</p>
          )}
        </Step>
      </ol>
    </div>
  );
}
