import { useMemo, useState } from "react";
import { AlarmClock, BookOpen, ChevronRight, ClipboardPlus, GraduationCap, LifeBuoy, PenLine, Sparkles } from "lucide-react";
import { useApp } from "../context.js";
import { addDays, countdown, formatLong, formatShort, nowTime, todayIso, weekdayOf } from "../lib/dates.js";
import { agendaItems, itemKinds, lessonStatus, subjectById, topicProgress } from "../lib/domain.js";
import { Empty } from "../ui.jsx";
import { ExamForm, TaskForm } from "../components/forms.jsx";
import { LessonForm, saveLesson } from "../components/LessonForm.jsx";

// Linha de agenda usada no Início e no Calendário. Tipo sempre aparece em texto e ícone, não só pela cor.
export function AgendaRow({ item, onOpen, showDate = false }) {
  const kind = itemKinds[item.kind];
  const Icon = kind.icon;
  const status = item.kind === "aula" ? lessonStatus[item.status].short : item.done ? "Concluída" : kind.label;
  return (
    <button type="button" className={`row agenda-row kind-${item.kind} ${item.done || item.status === "cancelada" ? "is-muted" : ""}`} style={{ "--subject": item.subject?.color || "var(--accent)" }} onClick={() => onOpen?.(item)}>
      <span className="row-time">{showDate ? formatShort(item.date) : item.start || "Dia todo"}</span>
      <span className="subject-dot" aria-hidden="true" />
      <span className="row-main">
        <strong>{item.title}</strong>
        <small>{[item.kind !== "aula" && item.subject?.name, item.kind === "aula" && item.detail, item.end && !showDate && `até ${item.end}`].filter(Boolean).join(", ")}</small>
      </span>
      <span className={`row-tag tag-${item.kind}`}>
        <Icon size={13} aria-hidden="true" /> {status}
      </span>
    </button>
  );
}

function useReminders(data, user, today) {
  return useMemo(() => {
    const list = [];
    const prefs = user.preferences?.reminders || {};
    const now = nowTime();
    if (prefs.classes !== false) {
      const unregistered = agendaItems(data, user, today, today).filter((item) => item.kind === "aula" && item.status === "pendente" && (!item.start || item.start <= now));
      if (unregistered.length) list.push({ id: "aula", icon: BookOpen, text: unregistered.length === 1 ? "Você ainda não registrou a aula de hoje." : `Você ainda não registrou ${unregistered.length} aulas de hoje.`, page: "aulas" });
    }
    const drafts = data.lessons.filter((lesson) => lesson.draft);
    if (drafts.length) list.push({ id: "rascunho", icon: PenLine, text: drafts.length === 1 ? "Há um registro de aula em rascunho." : `Há ${drafts.length} registros de aula em rascunho.`, page: "aulas" });
    if (prefs.exams !== false) {
      const soonExam = data.exams.find((exam) => exam.date >= today && exam.date <= addDays(today, 14) && exam.prepStatus === "Não iniciada");
      if (soonExam) list.push({ id: "prova", icon: GraduationCap, text: `Sua prova “${soonExam.title}” é ${countdown(soonExam.date, today)}. Que tal começar a revisão?`, page: "provas", params: { id: soonExam.id } });
    }
    const soonTask = data.tasks.find((task) => !task.done && task.dueDate >= today && task.dueDate <= addDays(today, 3));
    if (soonTask) list.push({ id: "tarefa", icon: ClipboardPlus, text: `Há um trabalho com prazo próximo: “${soonTask.title}”, ${countdown(soonTask.dueDate, today)}.`, page: "calendario", params: { date: soonTask.dueDate } });
    const lateTasks = data.tasks.filter((task) => !task.done && task.dueDate < today);
    if (lateTasks.length) list.push({ id: "atrasada", icon: AlarmClock, text: lateTasks.length === 1 ? "Uma atividade passou do prazo." : `${lateTasks.length} atividades passaram do prazo.`, page: "calendario" });
    const pendingTopics = data.exams.filter((exam) => exam.date >= today).flatMap((exam) => exam.topics).filter((topic) => topic.status === "Não iniciado").length;
    if (pendingTopics && !list.some((item) => item.id === "prova")) list.push({ id: "topicos", icon: Sparkles, text: `Você tem ${pendingTopics} ${pendingTopics === 1 ? "conteúdo pendente" : "conteúdos pendentes"} para revisar.`, page: "provas" });
    if (prefs.study !== false) {
      const nowStamp = Date.parse(`${today}T${now}:00`);
      for (const event of data.events) {
        if (!event.reminderMinutes || !event.startTime || event.done) continue;
        const start = Date.parse(`${event.date}T${event.startTime}:00`);
        if (start >= nowStamp && start - event.reminderMinutes * 60_000 <= nowStamp) {
          list.push({ id: `evento-${event.id}`, icon: AlarmClock, text: event.kind === "Sessão de estudo" ? `Está na hora da sua sessão de estudos: ${event.title}, às ${event.startTime}.` : `Lembrete: ${event.title}, ${formatShort(event.date)} às ${event.startTime}.`, page: "calendario", params: { date: event.date } });
        }
      }
    }
    return list.slice(0, 4);
  }, [data, user, today]);
}

export default function Home() {
  const app = useApp();
  const { data, user, go, update, toast } = app;
  const today = todayIso();
  const [modal, setModal] = useState(null);
  const todays = agendaItems(data, user, today, today);
  const todaysClasses = todays.filter((item) => item.kind === "aula");
  const week = agendaItems(data, user, addDays(today, 1), addDays(today, 7)).filter((item) => item.kind !== "aula");
  const weekAll = agendaItems(data, user, today, addDays(today, 6));
  const exams = data.exams.filter((exam) => exam.date >= today).slice(0, 4);
  const tasks = data.tasks.filter((task) => !task.done).slice(0, 5);
  const reminders = useReminders(data, user, today);
  const progress = topicProgress(data.exams);
  const totalTopics = Object.values(progress).reduce((sum, value) => sum + value, 0);
  const doneTasks = data.tasks.filter((task) => task.done).length;
  const registered = data.lessons.filter((lesson) => lesson.status === "presente" && !lesson.draft).length;
  const first = user.name.split(" ")[0];

  const quickStatus = async (occurrence, status) => {
    try {
      await saveLesson(app, occurrence, { status, draft: false });
      toast(status === "falta" ? "Falta registrada. A aula continua no calendário." : "Aula marcada como cancelada.");
    } catch (error) {
      toast(error.message);
    }
  };

  return (
    <div className="page home">
      <header className="home-head">
        <p className="today-date">{formatLong(today)}</p>
        <h1>Olá, {first}! Vamos organizar seus estudos?</h1>
        <div className="quick-actions">
          <button className="btn primary" onClick={() => go("aulas")}>
            <BookOpen size={16} /> Registrar aula
          </button>
          <button className="btn" onClick={() => setModal({ type: "exam" })}>
            <GraduationCap size={16} /> Adicionar prova
          </button>
          <button className="btn" onClick={() => setModal({ type: "task" })}>
            <ClipboardPlus size={16} /> Cadastrar atividade
          </button>
          <button className="btn" onClick={() => go("ia")}>
            <Sparkles size={16} /> Começar a estudar
          </button>
          <button className="btn sos" onClick={() => go("ia", { tool: "socorro" })}>
            <LifeBuoy size={16} /> Socorro, tenho prova!
          </button>
        </div>
      </header>

      {reminders.length > 0 && (
        <ul className="group reminders" aria-label="Avisos">
          {reminders.map(({ id, icon: Icon, text, page, params }) => (
            <li key={id}>
              <button type="button" className="row" onClick={() => go(page, params)}>
                <Icon size={16} aria-hidden="true" className="row-icon" />
                <span className="row-main">{text}</span>
                <ChevronRight size={16} aria-hidden="true" className="chevron" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="home-columns">
        <div className="home-main">
          <section>
            <h2 className="section-title">Você teve aula hoje?</h2>
            {todaysClasses.length ? (
              <ul className="group">
                {todaysClasses.map((item) => {
                  const lesson = item.occurrence.lesson;
                  return (
                    <li key={item.id} className="row class-row" style={{ "--subject": item.subject.color }}>
                      <span className="row-time">{item.start}</span>
                      <span className="subject-dot" aria-hidden="true" />
                      <span className="row-main">
                        <strong>{item.subject.name}</strong>
                        <small>
                          {lessonStatus[item.status].label}
                          {lesson?.draft ? ", rascunho" : ""}
                          {item.occurrence.room ? `, ${item.occurrence.room}` : ""}
                        </small>
                      </span>
                      <span className="row-actions">
                        <button className="btn primary small" onClick={() => setModal({ type: "lesson", occurrence: item.occurrence })}>
                          {lesson?.draft ? "Continuar" : lesson ? "Abrir registro" : "Registrar aula"}
                        </button>
                        {!lesson && (
                          <>
                            <button className="btn small" onClick={() => quickStatus(item.occurrence, "falta")}>
                              Faltei
                            </button>
                            <button className="btn small" onClick={() => quickStatus(item.occurrence, "cancelada")}>
                              Cancelada
                            </button>
                          </>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty compact mood="sleepy" title={data.subjects.length ? "Nenhuma aula na sua grade hoje." : "Cadastre suas disciplinas para ver suas aulas aqui."}>
                {data.subjects.length ? "Se teve aula extra ou reposição, registre em Dias de aula." : null}
                {!data.subjects.length && (
                  <button className="btn small" onClick={() => go("conteudos")}>
                    Cadastrar disciplinas
                  </button>
                )}
              </Empty>
            )}
          </section>

          <section>
            <h2 className="section-title">Minha rotina de hoje</h2>
            {todays.length ? (
              <div className="group">
                {todays.map((item) => (
                  <AgendaRow
                    key={item.id}
                    item={item}
                    onOpen={(entry) => (entry.kind === "aula" ? setModal({ type: "lesson", occurrence: entry.occurrence }) : entry.kind === "prova" ? go("provas", { id: entry.record.id }) : go("calendario", { date: today, view: "dia" }))}
                  />
                ))}
              </div>
            ) : (
              <p className="quiet">Nada marcado para hoje. Você pode planejar uma sessão de estudo no calendário.</p>
            )}
          </section>

          <section>
            <div className="section-head">
              <h2 className="section-title">Próximos dias</h2>
              <button className="link-btn" onClick={() => go("calendario")}>
                Abrir calendário <ChevronRight size={14} />
              </button>
            </div>
            <div className="week-strip">
              {Array.from({ length: 7 }, (_, index) => {
                const day = addDays(today, index);
                const items = weekAll.filter((item) => item.date === day);
                return (
                  <button key={day} type="button" className={index === 0 ? "is-today" : ""} onClick={() => go("calendario", { date: day, view: "dia" })} aria-label={`${formatLong(day)}: ${items.length} ${items.length === 1 ? "item" : "itens"}`}>
                    <small>{weekdayOf(day)}</small>
                    <strong>{Number(day.slice(8))}</strong>
                    <span className="dots" aria-hidden="true">
                      {items.slice(0, 4).map((item) => (
                        <i key={item.id} className={`dot kind-${item.kind}`} style={{ "--subject": item.subject?.color || "var(--accent)" }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            {week.length > 0 && (
              <div className="group">
                {week.slice(0, 5).map((item) => (
                  <AgendaRow key={item.id} item={item} showDate onOpen={() => (item.kind === "prova" ? go("provas", { id: item.record.id }) : go("calendario", { date: item.date, view: "dia" }))} />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="home-side">
          <section>
            <div className="section-head">
              <h2 className="section-title">Próximas avaliações</h2>
              {data.exams.length > 0 && (
                <button className="link-btn" onClick={() => go("provas")}>
                  Ver todas
                </button>
              )}
            </div>
            {exams.length ? (
              <ul className="group">
                {exams.map((exam) => {
                  const subject = subjectById(data.subjects, exam.subjectId);
                  return (
                    <li key={exam.id}>
                      <button type="button" className="row exam-row" style={{ "--subject": subject?.color }} onClick={() => go("provas", { id: exam.id })}>
                        <span className="subject-dot" aria-hidden="true" />
                        <span className="row-main">
                          <strong>{exam.title}</strong>
                          <small>
                            {subject?.name}, {formatShort(exam.date)}
                            {exam.time ? ` às ${exam.time}` : ""}
                          </small>
                          <small>Preparação: {exam.prepStatus.toLowerCase()}</small>
                        </span>
                        <span className="countdown">{countdown(exam.date, today)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="quiet">Nenhuma prova cadastrada. Quando o professor marcar uma avaliação, adicione aqui para acompanhar a preparação.</p>
            )}
          </section>

          <section>
            <h2 className="section-title">Próximas entregas</h2>
            {tasks.length ? (
              <ul className="group">
                {tasks.map((task) => {
                  const subject = subjectById(data.subjects, task.subjectId);
                  const late = task.dueDate < today;
                  return (
                    <li key={task.id} className="row task-row" style={{ "--subject": subject?.color || "var(--text-3)" }}>
                      <input
                        type="checkbox"
                        className="round-check"
                        aria-label={`Concluir ${task.title}`}
                        checked={task.done}
                        onChange={async () => {
                          try {
                            await update("tasks", task.id, { done: !task.done });
                            toast("Atividade concluída.");
                          } catch (error) {
                            toast(error.message);
                          }
                        }}
                      />
                      <span className="row-main">
                        <strong>{task.title}</strong>
                        <small className={late ? "late" : ""}>
                          {task.kind}, {late ? "atrasada " : ""}
                          {countdown(task.dueDate, today)}
                          {subject ? `, ${subject.name}` : ""}
                        </small>
                      </span>
                      <button className="icon-btn" aria-label={`Editar ${task.title}`} onClick={() => setModal({ type: "task", task })}>
                        <PenLine size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="quiet">Sem entregas pendentes.</p>
            )}
          </section>

          <section>
            <div className="section-head">
              <h2 className="section-title">Progresso</h2>
              <button className="link-btn" onClick={() => go("historico")}>
                Histórico
              </button>
            </div>
            {totalTopics || data.tasks.length || data.lessons.length ? (
              <dl className="group stat-list">
                <div className="row">
                  <dt>Conteúdos revisados</dt>
                  <dd>{totalTopics ? `${progress.Revisado + progress.Dominado} de ${totalTopics}` : "Sem provas com tópicos"}</dd>
                </div>
                <div className="row">
                  <dt>Tópicos pendentes</dt>
                  <dd>{totalTopics ? progress["Não iniciado"] + progress["Em estudo"] : "–"}</dd>
                </div>
                <div className="row">
                  <dt>Tarefas concluídas</dt>
                  <dd>{data.tasks.length ? `${doneTasks} de ${data.tasks.length}` : "–"}</dd>
                </div>
                <div className="row">
                  <dt>Aulas registradas</dt>
                  <dd>{registered}</dd>
                </div>
              </dl>
            ) : (
              <p className="quiet">Os números aparecem quando você registrar aulas, provas com tópicos e atividades.</p>
            )}
            <p className="footnote">Tarefas concluídas mostram organização, não domínio do conteúdo. O domínio é você quem marca em cada prova.</p>
          </section>
        </aside>
      </div>

      {modal?.type === "exam" && <ExamForm onClose={() => setModal(null)} onSaved={(exam) => go("provas", { id: exam.id })} />}
      {modal?.type === "task" && <TaskForm task={modal.task} onClose={() => setModal(null)} />}
      {modal?.type === "lesson" && <LessonForm occurrence={modal.occurrence} onClose={() => setModal(null)} />}
    </div>
  );
}
