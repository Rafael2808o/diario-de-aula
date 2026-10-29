import { useMemo, useState } from "react";
import { AlarmClock, BookOpen, ChevronRight, ClipboardPlus, Flame, GraduationCap, LifeBuoy } from "lucide-react";
import { useApp } from "../context.js";
import { addDays, countdown, formatFull, formatShort, nowTime, todayIso } from "../lib/dates.js";
import { agendaItems, itemKinds, lessonStatus, lessonsWithoutMaterial, pendingLessons, progressOf, subjectById, subjectProgress } from "../lib/domain.js";
import { Empty } from "../ui.jsx";
import { NoxPose, ProgressRing } from "../components/Art.jsx";
import { ExamForm, TaskForm } from "../components/forms.jsx";
import { LessonForm, saveLesson } from "../components/LessonForm.jsx";
import { AnnouncementBanner } from "../components/Announcements.jsx";
import Horoscope from "../components/Horoscope.jsx";

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
  const shown = all ? items : items.slice(0, 3);
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
          {items.length > 3 && (
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

// Aulas com registro, mas sem material anexado. É outra pendência, separada de "sem conteúdo":
// uma aula pode ter caderno completo e nenhum arquivo do professor.
function MaterialPending({ data, onOpen, onNoMaterial }) {
  const today = todayIso();
  const { missing, marked } = useMemo(() => lessonsWithoutMaterial(data, today), [data, today]);
  const [all, setAll] = useState(false);
  if (!missing.length && !marked.length) return null;
  const shown = all ? missing : missing.slice(0, 3);
  return (
    <section aria-labelledby="sem-material-title">
      <div className="section-head">
        <h2 className="section-title" id="sem-material-title">
          Aulas sem material anexado {missing.length > 0 && <span className="count-badge">{missing.length}</span>}
        </h2>
      </div>
      {missing.length ? (
        <ul className="group">
          {shown.map((lesson) => {
            const subject = subjectById(data.subjects, lesson.subjectId);
            if (!subject) return null;
            return (
              <li key={lesson.id} className="row pending-row" style={{ "--subject": subject.color }}>
                <span className="subject-dot" aria-hidden="true" />
                <span className="row-main">
                  <strong>{subject.name}</strong>
                  <small>
                    {lesson.date === today ? "Hoje" : formatFull(lesson.date)}
                    {lesson.theme ? `, ${lesson.theme}` : ""}
                  </small>
                </span>
                <span className="pending-tag pending-material">Material ainda não anexado</span>
                <span className="row-actions">
                  <button className="btn small" onClick={() => onOpen(lesson, subject)}>
                    Anexar
                  </button>
                  <button className="btn small ghost" onClick={() => onNoMaterial(lesson)}>
                    Não teve material
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hint">Todas as aulas recentes têm material ou foram marcadas como sem material.</p>
      )}
      {missing.length > 3 && (
        <button className="link-btn" onClick={() => setAll(!all)}>
          {all ? "Mostrar menos" : `Ver todas as ${missing.length}`}
        </button>
      )}
      {marked.length > 0 && (
        <p className="hint">
          {marked.length === 1 ? "1 aula foi marcada" : `${marked.length} aulas foram marcadas`} como “sem material disponibilizado” e não contam como pendência.
        </p>
      )}
    </section>
  );
}

// O que estudar agora: a prova mais próxima com assunto ainda não revisado; sem prova à vista,
// a disciplina da próxima aula, revisando o tema da última aula registrada dela.
function nextRitual(data, user, today) {
  const exam = data.exams.find((item) => item.date >= today && item.date <= addDays(today, 21) && item.topics.some((topic) => topic.status !== "Dominado"));
  if (exam) {
    const subject = subjectById(data.subjects, exam.subjectId);
    const topic = exam.topics.find((item) => item.status === "Não iniciado" || item.status === "Em estudo") || exam.topics.find((item) => item.status !== "Dominado");
    return { subject, title: subject?.name || exam.title, detail: `Revisar ${topic.title}`, when: `${exam.title} ${countdown(exam.date, today)}` };
  }
  const upcoming = agendaItems(data, user, today, addDays(today, 7)).find((item) => item.kind === "aula" && (item.date > today || !item.start || item.start >= nowTime()));
  const subject = upcoming?.subject || data.subjects[0];
  if (!subject) return null;
  const last = data.lessons.filter((lesson) => lesson.subjectId === subject.id && lesson.theme).sort((x, y) => y.date.localeCompare(x.date))[0];
  return {
    subject,
    title: subject.name,
    detail: last ? `Revisar ${last.theme}` : "Revisar a última aula",
    when: upcoming ? `Próxima aula ${upcoming.date === today ? "hoje" : formatShort(upcoming.date)}${upcoming.start ? `, ${upcoming.start}` : ""}` : "",
  };
}

const whenLabel = (item, today) => {
  const day = item.date === today ? "Hoje" : item.date === addDays(today, 1) ? "Amanhã" : formatShort(item.date);
  return item.start ? `${day}, ${item.start}` : day;
};

export default function Home() {
  const app = useApp();
  const { data, user, go, toast, ritual } = app;
  const today = todayIso();
  const [modal, setModal] = useState(null);
  const reminders = useReminders(data, user, today);
  const pending = useMemo(() => pendingLessons(data, user, today, nowTime()), [data, user, today]);
  const progress = useMemo(() => progressOf(data, today), [data, today]);
  const overall = useMemo(() => {
    const parts = data.subjects.map((subject) => subjectProgress(data, user, subject, today));
    const done = parts.reduce((sum, part) => sum + part.registered + part.topicsDone, 0);
    const total = parts.reduce((sum, part) => sum + part.occurred + part.topics, 0);
    return total ? Math.round((done / total) * 100) : null;
  }, [data, user, today]);
  const upcoming = useMemo(
    () => agendaItems(data, user, today, addDays(today, 14)).filter((item) => !item.done && item.status !== "cancelada" && (item.date > today || !item.start || item.start >= nowTime())).slice(0, 4),
    [data, user, today],
  );
  const next = useMemo(() => nextRitual(data, user, today), [data, user, today]);
  const first = user.name.split(" ")[0];
  const ritualActive = ritual.state.status === "running" || ritual.state.status === "paused";
  const lateTasks = data.tasks.filter((task) => !task.done && task.dueDate < today);
  const reviewCards = data.flashcards.filter((card) => card.level === "difícil" || card.level === "dúvida");

  const quickStatus = async (occurrence, status) => {
    try {
      await saveLesson(app, occurrence, { status, draft: false });
      toast(status === "falta" ? "Falta registrada. Anote depois o conteúdo perdido." : "Aula marcada como cancelada.");
    } catch (error) {
      toast(error.message);
    }
  };

  const startRitual = () => {
    if (!ritualActive && ritual.state.status !== "finished") ritual.start(next?.subject?.id || "");
    ritual.setView("open");
  };

  // Uma recomendação por vez, sempre baseada em algo concreto dos registros.
  const advice = pending.length
    ? { pose: "reading", text: `${pending.length === 1 ? "Uma aula está" : `${pending.length} aulas estão`} sem conteúdo. Completar ${pending[0].subject.name} leva poucos minutos.`, label: "Completar agora", action: () => setModal({ type: "lesson", occurrence: pending[0] }) }
    : reviewCards.length
      ? { pose: "tarot", text: `${reviewCards.length} ${reviewCards.length === 1 ? "carta pede" : "cartas pedem"} revisão nas Cartas do Saber.`, label: "Revisar cartas", action: () => go("cartoes") }
      : lateTasks.length
        ? { pose: "waiting", text: lateTasks.length === 1 ? "Uma atividade passou do prazo." : `${lateTasks.length} atividades passaram do prazo.`, label: "Ver na agenda", action: () => go("calendario") }
        : { pose: "star", text: "Tudo em dia por aqui. Algumas questões ajudam a fixar o que você já registrou.", label: "Praticar questões", action: () => go("ia", { tool: "questoes" }) };

  return (
    <div className="page home">
      <header className="home-hero">
        <div>
          <h1>Olá, {first}.</h1>
          <p>{ritualActive ? "Seu ritual está em andamento." : pending.length ? "Vamos colocar o grimório em dia?" : "Que tal continuar seu ritual hoje?"}</p>
        </div>
        <NoxPose pose="reading" size={92} className="home-nox" />
      </header>

      <AnnouncementBanner />

      <section className="focus-card" aria-label="Seu progresso e próximo ritual">
        <div className="focus-progress">
          <h2>Seu progresso</h2>
          <ProgressRing value={overall ?? 0} size={92} label={overall === null ? "Progresso ainda sem dados" : `${overall}% das aulas e assuntos em dia`}>
            {overall === null ? "–" : `${overall}%`}
          </ProgressRing>
          <button type="button" className="focus-level" onClick={() => go("perfil")}>
            Nível {progress.level}
            {progress.streak > 0 && (
              <span>
                <Flame size={13} aria-hidden="true" /> {progress.streak} {progress.streak === 1 ? "dia" : "dias"}
              </span>
            )}
          </button>
        </div>
        <div className="focus-next">
          <h2>Próximo ritual</h2>
          {next ? (
            <>
              <strong style={{ "--subject": next.subject?.color }}>
                <span className="subject-dot" aria-hidden="true" /> {next.title}
              </strong>
              <p>{next.detail}</p>
              {next.when && <small>{next.when}</small>}
            </>
          ) : (
            <p>Cadastre suas disciplinas para receber sugestões.</p>
          )}
          <button className="btn primary" onClick={startRitual}>
            {ritualActive ? "Voltar ao ritual" : "Começar"}
          </button>
        </div>
      </section>

      <div className="quick-actions">
        <button className="btn" onClick={() => go("aulas")}>
          <BookOpen size={16} /> Registrar aula
        </button>
        <button className="btn" onClick={() => setModal({ type: "exam" })}>
          <GraduationCap size={16} /> Adicionar prova
        </button>
        <button className="btn" onClick={() => setModal({ type: "task" })}>
          <ClipboardPlus size={16} /> Nova atividade
        </button>
        <button className="btn sos" onClick={() => go("ia", { tool: "socorro" })}>
          <LifeBuoy size={16} /> Socorro, tenho prova!
        </button>
      </div>

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
          <section aria-labelledby="compromissos-title">
            <div className="section-head">
              <h2 className="section-title" id="compromissos-title">
                Próximos compromissos
              </h2>
              <button className="link-btn" onClick={() => go("calendario")}>
                Agenda <ChevronRight size={14} />
              </button>
            </div>
            {upcoming.length ? (
              <ul className="group commitments">
                {upcoming.map((item) => {
                  const Icon = itemKinds[item.kind].icon;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`row commitment kind-${item.kind}`}
                        style={{ "--subject": item.subject?.color || "var(--accent)" }}
                        onClick={() => (item.kind === "aula" ? setModal({ type: "lesson", occurrence: item.occurrence }) : item.kind === "prova" ? go("provas", { id: item.record.id }) : go("calendario", { date: item.date, view: "dia" }))}
                      >
                        <span className="commitment-icon" aria-hidden="true">
                          <Icon size={16} />
                        </span>
                        <span className="row-main">
                          <strong>{item.title}</strong>
                          <small>{[whenLabel(item, today), item.kind !== "aula" && item.subject?.name].filter(Boolean).join(" · ")}</small>
                        </span>
                        <span className={`row-tag tag-${item.kind}`}>{itemKinds[item.kind].label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="quiet">Nada marcado para as próximas duas semanas.</p>
            )}
          </section>

          {data.subjects.length ? (
            <>
            <PendingLessons items={pending} onOpen={(item) => setModal({ type: "lesson", occurrence: item })} onStatus={quickStatus} />
            <MaterialPending
              data={data}
              onOpen={(lesson, subject) => setModal({ type: "lesson", occurrence: { subject, date: lesson.date, start: lesson.startTime, end: "", room: "", lesson } })}
              onNoMaterial={(lesson) => app.update("lessons", lesson.id, { noMaterial: true }).then(() => toast("Aula marcada como sem material disponibilizado.")).catch((failure) => toast(failure.message))}
            />
            </>
          ) : (
            <Empty title="Cadastre suas disciplinas para começar.">
              Com os dias e horários de cada matéria, a Grimiau monta as aulas do semestre e mostra o que falta registrar.
              <button className="btn small primary" onClick={() => go("conteudos")}>
                Cadastrar disciplinas
              </button>
            </Empty>
          )}
        </div>

        <aside className="home-side">
          <section className="advice" aria-labelledby="conselho-title">
            <NoxPose pose={advice.pose} size={72} />
            <div>
              <h2 id="conselho-title">O Grimiau recomenda</h2>
              <p>{advice.text}</p>
              <button className="btn small soft" onClick={advice.action}>
                {advice.label}
              </button>
            </div>
          </section>
          <Horoscope />
        </aside>
      </div>

      {modal?.type === "exam" && <ExamForm onClose={() => setModal(null)} onSaved={(exam) => go("provas", { id: exam.id })} />}
      {modal?.type === "task" && <TaskForm task={modal.task} onClose={() => setModal(null)} />}
      {modal?.type === "lesson" && <LessonForm occurrence={modal.occurrence} onClose={() => setModal(null)} />}
    </div>
  );
}
