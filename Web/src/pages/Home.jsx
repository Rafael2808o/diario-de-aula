import { useMemo, useState } from "react";
import { AlarmClock, BookOpen, ChevronRight, ClipboardPlus, GraduationCap, Hourglass, LifeBuoy, PenLine, Sparkles } from "lucide-react";
import { useApp } from "../context.js";
import { addDays, countdown, formatFull, formatLong, formatShort, nowTime, startOfWeek, todayIso } from "../lib/dates.js";
import { agendaItems, itemKinds, lessonStatus, pendingLessons, subjectById, topicProgress } from "../lib/domain.js";
import { formatDuration } from "../lib/ritual.js";
import { Avatar, Empty } from "../ui.jsx";
import { ExamForm, TaskForm } from "../components/forms.jsx";
import { LessonForm, saveLesson } from "../components/LessonForm.jsx";
import { AnnouncementBanner } from "../components/Announcements.jsx";
import Horoscope from "../components/Horoscope.jsx";
import { PostRow, usePosts } from "./Community.jsx";

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

// Avisos que não cabem nas outras seções do Observatório. Aulas sem conteúdo têm seção própria.
function useReminders(data, user, today) {
  return useMemo(() => {
    const list = [];
    const prefs = user.preferences?.reminders || {};
    const now = nowTime();
    if (prefs.exams !== false) {
      const soonExam = data.exams.find((exam) => exam.date >= today && exam.date <= addDays(today, 14) && exam.prepStatus === "Não iniciada");
      if (soonExam) list.push({ id: "prova", icon: GraduationCap, text: `Sua prova “${soonExam.title}” é ${countdown(soonExam.date, today)}. Que tal começar a revisão?`, page: "provas", params: { id: soonExam.id } });
    }
    const lateTasks = data.tasks.filter((task) => !task.done && task.dueDate < today);
    if (lateTasks.length) list.push({ id: "atrasada", icon: AlarmClock, text: lateTasks.length === 1 ? "Uma atividade passou do prazo." : `${lateTasks.length} atividades passaram do prazo.`, page: "calendario" });
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
    return list.slice(0, 3);
  }, [data, user, today]);
}

const pendingLabel = {
  vazia: "Sem conteúdo",
  revisar: "Rascunho para revisar",
  perdida: "Falta sem o conteúdo perdido",
};

function PendingLessons({ items, onOpen, onStatus }) {
  const [all, setAll] = useState(false);
  const bySubject = items.reduce((map, item) => map.set(item.subject.id, (map.get(item.subject.id) || 0) + 1), new Map());
  const shown = all ? items : items.slice(0, 5);
  return (
    <section aria-labelledby="pendentes-title">
      <div className="section-head">
        <h2 className="section-title" id="pendentes-title">
          Aulas que precisam de conteúdo {items.length > 0 && <span className="count-badge">{items.length}</span>}
        </h2>
      </div>
      {items.length ? (
        <>
          {bySubject.size > 1 && (
            <p className="hint pending-summary">
              {[...bySubject].map(([id, count]) => `${items.find((item) => item.subject.id === id).subject.name}: ${count}`).join(" · ")}
            </p>
          )}
          <ul className="group">
            {shown.map((item) => (
              <li key={item.key} className="row pending-row" style={{ "--subject": item.subject.color }}>
                <span className="subject-dot" aria-hidden="true" />
                <span className="row-main">
                  <strong>{item.subject.name}</strong>
                  <small>
                    {item.date === todayIso() ? "Hoje" : formatFull(item.date)}
                    {item.start ? `, ${item.start}` : ""}
                    {item.lesson?.theme ? `, ${item.lesson.theme}` : ""}
                  </small>
                </span>
                <span className={`pending-tag pending-${item.kind}`}>{pendingLabel[item.kind]}</span>
                <span className="row-actions">
                  <button className="btn primary small" onClick={() => onOpen(item)}>
                    {item.kind === "revisar" ? "Revisar" : item.lesson ? "Completar" : "Registrar"}
                  </button>
                  {!item.lesson && (
                    <>
                      <button className="btn small ghost" onClick={() => onStatus(item, "falta")}>
                        Faltei
                      </button>
                      <button className="btn small ghost" onClick={() => onStatus(item, "cancelada")}>
                        Cancelada
                      </button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
          {items.length > 5 && (
            <button className="link-btn" onClick={() => setAll(!all)}>
              {all ? "Mostrar menos" : `Ver todas as ${items.length}`}
            </button>
          )}
        </>
      ) : (
        <Empty compact mood="happy" title="Tudo em dia! Todas as aulas possuem conteúdo cadastrado.">
          As aulas das últimas semanas estão registradas, com falta anotada ou canceladas.
        </Empty>
      )}
    </section>
  );
}

function CommunityPreview() {
  const { go } = useApp();
  const { status, posts } = usePosts();
  return (
    <section aria-labelledby="quadro-title">
      <div className="section-head">
        <h2 className="section-title" id="quadro-title">
          Quadro de Dúvidas
        </h2>
        <button className="link-btn" onClick={() => go("comunidade")}>
          Abrir quadro <ChevronRight size={14} />
        </button>
      </div>
      {status === "loading" ? (
        <p className="quiet">Carregando...</p>
      ) : status === "error" ? (
        <p className="quiet">O quadro não abriu agora. Tente de novo mais tarde.</p>
      ) : posts.length ? (
        <ul className="group">
          {posts.slice(0, 3).map((post) => (
            <PostRow key={post.id} post={post} onOpen={(item) => go("comunidade", { id: item.id })} />
          ))}
        </ul>
      ) : (
        <p className="quiet">
          Ninguém publicou ainda.{" "}
          <button className="link-btn" onClick={() => go("comunidade")}>
            Deixe a primeira dúvida ou ideia
          </button>
        </p>
      )}
    </section>
  );
}

export default function Home() {
  const app = useApp();
  const { data, user, go, update, toast, ritual } = app;
  const today = todayIso();
  const [modal, setModal] = useState(null);
  const todays = agendaItems(data, user, today, today);
  const exams = data.exams.filter((exam) => exam.date >= today).slice(0, 3);
  const tasks = data.tasks.filter((task) => !task.done).slice(0, 4);
  const reminders = useReminders(data, user, today);
  const pending = useMemo(() => pendingLessons(data, user, today, nowTime()), [data, user, today]);
  const progress = topicProgress(data.exams);
  const totalTopics = Object.values(progress).reduce((sum, value) => sum + value, 0);
  const registered = data.lessons.filter((lesson) => lesson.status === "presente" && !lesson.draft).length;
  const weekStart = startOfWeek(today);
  const sessions = data["study-sessions"];
  const todaySeconds = sessions.filter((session) => session.date === today).reduce((sum, session) => sum + session.durationSeconds, 0);
  const weekSeconds = sessions.filter((session) => session.date >= weekStart && session.date <= today).reduce((sum, session) => sum + session.durationSeconds, 0);
  const first = user.name.split(" ")[0];
  const ritualActive = ritual.state.status === "running" || ritual.state.status === "paused";

  const quickStatus = async (occurrence, status) => {
    try {
      await saveLesson(app, occurrence, { status, draft: false });
      toast(status === "falta" ? "Falta registrada. Anote depois o conteúdo perdido." : "Aula marcada como cancelada.");
    } catch (error) {
      toast(error.message);
    }
  };

  return (
    <div className="page home">
      <header className="home-head">
        <Avatar user={user} size={56} className="home-avatar" />
        <div>
          <p className="today-date">{formatLong(today)}</p>
          <h1>Olá, {first}. Vamos desvendar alguns conteúdos?</h1>
        </div>
      </header>
      <div className="quick-actions">
        <button className="btn primary" onClick={() => ritual.setView("open")}>
          <Hourglass size={16} /> {ritualActive ? "Voltar ao ritual" : "Iniciar ritual de estudo"}
        </button>
        <button className="btn" onClick={() => go("aulas")}>
          <BookOpen size={16} /> Registrar aula
        </button>
        <button className="btn" onClick={() => setModal({ type: "exam" })}>
          <GraduationCap size={16} /> Adicionar prova
        </button>
        <button className="btn" onClick={() => setModal({ type: "task" })}>
          <ClipboardPlus size={16} /> Cadastrar atividade
        </button>
        <button className="btn sos" onClick={() => go("ia", { tool: "socorro" })}>
          <LifeBuoy size={16} /> Socorro, tenho prova!
        </button>
      </div>

      <AnnouncementBanner />

      <dl className="observatory-stats" aria-label="Seu progresso">
        <div>
          <dt>Estudo hoje</dt>
          <dd>{todaySeconds ? formatDuration(todaySeconds) : "0 min"}</dd>
        </div>
        <div>
          <dt>Nesta semana</dt>
          <dd>{weekSeconds ? formatDuration(weekSeconds) : "0 min"}</dd>
        </div>
        <div>
          <dt>Aulas registradas</dt>
          <dd>{registered}</dd>
        </div>
        <div>
          <dt>Conteúdos revisados</dt>
          <dd>{totalTopics ? `${progress.Revisado + progress.Dominado} de ${totalTopics}` : "–"}</dd>
        </div>
      </dl>
      <p className="footnote">
        Tempo de estudo vem das sessões salvas no Ritual. Conteúdos revisados são os que você marcou nas provas.{" "}
        <button className="link-btn" onClick={() => go("historico")}>
          Ver histórico
        </button>
      </p>

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
          {data.subjects.length ? (
            <PendingLessons items={pending} onOpen={(item) => setModal({ type: "lesson", occurrence: item })} onStatus={quickStatus} />
          ) : (
            <Empty title="Cadastre suas disciplinas para começar.">
              Com os dias e horários de cada matéria, a Grimiau monta as aulas do semestre e mostra o que falta registrar.
              <button className="btn small primary" onClick={() => go("conteudos")}>
                Cadastrar disciplinas
              </button>
            </Empty>
          )}

          <section>
            <div className="section-head">
              <h2 className="section-title">Hoje</h2>
              <button className="link-btn" onClick={() => go("calendario")}>
                Calendário <ChevronRight size={14} />
              </button>
            </div>
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
              <p className="quiet">Nada marcado para hoje. Bom dia para adiantar uma revisão.</p>
            )}
          </section>

          <CommunityPreview />
        </div>

        <aside className="home-side">
          <section>
            <div className="section-head">
              <h2 className="section-title">Próximas provas e entregas</h2>
              {data.exams.length > 0 && (
                <button className="link-btn" onClick={() => go("provas")}>
                  Ver provas
                </button>
              )}
            </div>
            {exams.length || tasks.length ? (
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
                        </span>
                        <span className="countdown">{countdown(exam.date, today)}</span>
                      </button>
                    </li>
                  );
                })}
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
                            toast("Atividade concluída. Mais um feitiço riscado da lista!");
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
              <p className="quiet">Nenhuma prova ou entrega à vista. Quando o professor marcar uma avaliação, cadastre aqui.</p>
            )}
          </section>

          <Horoscope />

          <section className="ritual-invite">
            <Sparkles size={18} aria-hidden="true" />
            <p>
              {ritualActive ? "Seu ritual está em andamento. O tempo continua contando mesmo com o painel fechado." : "Seu ritual de concentração começa com um clique. Dá para fechar o painel e o tempo continua contando."}
            </p>
            <button className="btn small" onClick={() => ritual.setView("open")}>
              {ritualActive ? "Abrir painel" : "Abrir ritual"}
            </button>
          </section>
        </aside>
      </div>

      {modal?.type === "exam" && <ExamForm onClose={() => setModal(null)} onSaved={(exam) => go("provas", { id: exam.id })} />}
      {modal?.type === "task" && <TaskForm task={modal.task} onClose={() => setModal(null)} />}
      {modal?.type === "lesson" && <LessonForm occurrence={modal.occurrence} onClose={() => setModal(null)} />}
    </div>
  );
}
