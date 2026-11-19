import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronLeft, ChevronRight, Plus, PlusCircle, Sparkles } from "lucide-react";
import { useApp } from "../context.js";
import { addDays, addMonths, classOccurrences, endOfMonth, formatLong, formatMonth, formatShort, range, startOfMonth, startOfWeek, todayIso, weekdays } from "../lib/dates.js";
import { lessonStatus } from "../lib/domain.js";
import { Empty, FormError, Modal } from "../ui.jsx";
import { SubjectSelect } from "../components/forms.jsx";
import { LessonForm } from "../components/LessonForm.jsx";
import { reviewFromHtml } from "./Notebook.jsx";

export default function Lessons() {
  const { data, user, params, go } = useApp();
  const today = todayIso();
  const [cursor, setCursor] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date : today);
  const [selected, setSelected] = useState(cursor);
  const [open, setOpen] = useState(null);
  const [extra, setExtra] = useState(false);
  const [dayFilter, setDayFilter] = useState("todas");
  const monthStart = startOfWeek(startOfMonth(cursor));
  const monthEnd = addDays(startOfWeek(endOfMonth(cursor)), 6);
  const occurrences = useMemo(() => classOccurrences(data.subjects, data.lessons, user, monthStart, monthEnd), [data.subjects, data.lessons, user, monthStart, monthEnd]);
  const recent = useMemo(
    () => classOccurrences(data.subjects, data.lessons, user, addDays(today, -21), today).filter((item) => (!item.lesson && !item.holiday) || item.lesson?.draft).reverse(),
    [data.subjects, data.lessons, user, today],
  );

  // Link direto para um registro (busca, provas, conteúdos).
  useEffect(() => {
    if (!params.lesson) return;
    const lesson = data.lessons.find((item) => item.id === params.lesson);
    const subject = lesson && data.subjects.find((item) => item.id === lesson.subjectId);
    if (lesson && subject) {
      setCursor(lesson.date);
      setSelected(lesson.date);
      setOpen({ subject, date: lesson.date, start: lesson.startTime, end: "", room: "", lesson });
    }
  }, [params.lesson, data.lessons, data.subjects]);

  // Mantém o registro aberto sincronizado com o que foi salvo.
  const live = open && {
    ...open,
    lesson: data.lessons.find((lesson) => lesson.subjectId === open.subject.id && lesson.date === open.date && lesson.startTime === (open.start || "")) || open.lesson,
  };
  const dayItems = occurrences.filter((item) => item.date === selected);
  const written = (item) => Boolean(item.lesson && !item.lesson.draft);
  const toWrite = (item) => !item.holiday && !written(item);
  const shown = dayItems.filter((item) => (dayFilter === "pendentes" ? toWrite(item) : dayFilter === "registradas" ? written(item) : true));
  const countable = dayItems.filter((item) => !item.holiday && item.lesson?.status !== "cancelada");
  const doneCount = countable.filter(written).length;
  // Páginas em branco: dias recentes com aula ainda sem registro (ou só rascunho), do mais recente para o mais antigo.
  const blankDays = [...recent.reduce((map, item) => map.set(item.date, (map.get(item.date) || 0) + 1), new Map())];
  // Oráculo da revisão: dúvidas e trechos "Cai na prova" marcados com carimbo nos cadernos.
  const oracle = useMemo(() => {
    const doubts = [];
    const exam = [];
    for (const lesson of data.lessons) {
      if (!String(lesson.annotations || "").includes("data-stamp")) continue;
      const found = reviewFromHtml(lesson.annotations);
      if (found.doubts.length) doubts.push({ lesson, count: found.doubts.length });
      const marked = found.review.filter((item) => item.kind === "cai").length;
      if (marked) exam.push({ lesson, count: marked });
    }
    const newest = (list) => list.sort((a, b) => b.lesson.date.localeCompare(a.lesson.date))[0]?.lesson;
    return { doubts: doubts.reduce((sum, item) => sum + item.count, 0), doubtLesson: newest(doubts), exam: exam.length, examLesson: newest(exam) };
  }, [data.lessons]);
  const pick = (day) => {
    setCursor(day);
    setSelected(day);
    setDayFilter("todas");
  };

  return (
    <div className="page lessons-v4">
      <header className="page-head">
        <div>
          <h1>Registro de aulas</h1>
          <p>Cada aula registrada é uma página nova no seu grimório.</p>
        </div>
        <div className="page-actions">
          <button className="btn soft" onClick={() => setExtra(true)} disabled={!data.subjects.length}>
            <Plus size={16} /> Aula fora da grade
          </button>
        </div>
      </header>

      {!data.subjects.length ? (
        <Empty title="Cadastre suas disciplinas primeiro">Com os dias e horários de cada matéria, a Grimiau monta todas as aulas do semestre aqui.</Empty>
      ) : (
        <div className="lr-layout">
          <div className="lr-side">
            <section className="lr-card lessons-calendar">
              <div className="lr-month">
                <h2>{formatMonth(cursor)}</h2>
                <div>
                  <button className="icon-btn" aria-label="Mês anterior" onClick={() => setCursor(addMonths(cursor, -1))}>
                    <ChevronLeft size={17} />
                  </button>
                  <button className="btn ghost small" onClick={() => pick(today)}>
                    Hoje
                  </button>
                  <button className="icon-btn" aria-label="Próximo mês" onClick={() => setCursor(addMonths(cursor, 1))}>
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
              <div className="mini-month">
                {weekdays.map((day) => (
                  <span key={day} className="month-head">
                    {day.slice(0, 1)}
                  </span>
                ))}
                {range(monthStart, monthEnd).map((day) => {
                  const items = occurrences.filter((item) => item.date === day);
                  const blank = day <= today && items.some(toWrite);
                  return (
                    <button
                      key={day}
                      type="button"
                      className={`${day.slice(0, 7) !== cursor.slice(0, 7) ? "outside" : ""} ${day === today ? "today" : ""} ${day === selected ? "picked" : ""} ${blank ? "blank" : ""}`}
                      onClick={() => setSelected(day)}
                      aria-label={`${formatLong(day)}: ${items.length} aulas`}
                    >
                      {Number(day.slice(8))}
                      <span className="dots" aria-hidden="true">
                        {items.slice(0, 3).map((item) => (
                          <i key={item.key} className={`dot status-dot-${item.lesson?.status || (item.holiday ? "feriado" : "pendente")}`} style={{ "--subject": item.subject.color }} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="hint legend">
                <i className="dot status-dot-pendente" /> pendente <i className="dot status-dot-presente" /> registrada <i className="dot status-dot-falta" /> falta <i className="dot status-dot-cancelada" /> cancelada <i className="dot status-dot-feriado" /> feriado
              </p>
            </section>

            <section className="lr-card">
              <p className="eyebrow">Páginas em branco</p>
              {blankDays.length ? (
                <div className="lr-blank">
                  {blankDays.slice(0, 9).map(([day, count]) => (
                    <button key={day} type="button" className={day === selected ? "on" : ""} onClick={() => pick(day)}>
                      {formatShort(day)} · {count} {count === 1 ? "pendente" : "pendentes"}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="hint">Tudo em dia. Nenhuma aula das últimas três semanas está sem registro.</p>
              )}
            </section>

            {(oracle.doubts > 0 || oracle.exam > 0) && (
              <section className="lr-card lr-oracle">
                <h2>
                  <Sparkles size={16} aria-hidden="true" /> Oráculo da revisão
                </h2>
                {oracle.doubts > 0 && (
                  <button type="button" onClick={() => go("caderno", { lesson: oracle.doubtLesson.id })}>
                    <span data-stamp="duvida">?</span>
                    Você marcou {oracle.doubts} {oracle.doubts === 1 ? "trecho" : "trechos"} como Dúvida. Que tal tirar a dúvida?
                  </button>
                )}
                {oracle.exam > 0 && (
                  <button type="button" onClick={() => go("caderno", { lesson: oracle.examLesson.id })}>
                    <span data-stamp="cai">!</span>
                    {oracle.exam === 1 ? "Existe 1 aula" : `Existem ${oracle.exam} aulas`} com conteúdo marcado como Cai na prova.
                  </button>
                )}
              </section>
            )}
          </div>

          <section className="lr-day" aria-labelledby="lr-day-title">
            <p className="eyebrow">Aulas do dia</p>
            <h2 id="lr-day-title">{formatLong(selected)}</h2>
            {countable.length > 0 && (
              <div className="lr-progress">
                <span className="lr-progress-track" aria-hidden="true">
                  <i style={{ width: `${(doneCount / countable.length) * 100}%` }} />
                </span>
                <small>
                  {doneCount} de {countable.length} {countable.length === 1 ? "página escrita" : "páginas escritas"}
                </small>
              </div>
            )}
            {dayItems.length > 0 && (
              <div className="lr-filters" role="group" aria-label="Filtrar aulas do dia">
                {[
                  ["todas", "Todas", dayItems.length],
                  ["pendentes", "Para registrar", dayItems.filter(toWrite).length],
                  ["registradas", "Registradas", dayItems.filter(written).length],
                ].map(([id, label, count]) => (
                  <button key={id} type="button" aria-pressed={dayFilter === id} className={dayFilter === id ? "on" : ""} onClick={() => setDayFilter(id)}>
                    {label} <b>{count}</b>
                  </button>
                ))}
              </div>
            )}
            {shown.length ? (
              <ol className="lr-timeline">
                {shown.map((item) => {
                  const status = item.lesson?.status || (item.holiday ? "feriado" : "pendente");
                  const pending = toWrite(item);
                  return (
                    <li key={item.key}>
                      <span className="lr-time">
                        <strong>{item.start || "—"}</strong>
                        {item.end && <small>{item.end}</small>}
                      </span>
                      <button type="button" className={`lr-lesson ${pending ? "pending" : ""}`} style={{ "--subject": item.subject.color }} onClick={() => setOpen(item)}>
                        <span className="lr-lesson-head">
                          <i aria-hidden="true" />
                          <span>
                            <strong>{item.subject.name}</strong>
                            <small>
                              {[item.room, item.extra ? "fora da grade" : "", item.holiday, item.lesson?.draft ? "rascunho" : ""].filter(Boolean).join(" · ") || (pending ? "Toque para registrar" : lessonStatus[status].short)}
                            </small>
                          </span>
                          <span className={`lr-chip ${pending ? "todo" : `is-${status}`}`}>
                            {pending ? <PlusCircle size={15} aria-hidden="true" /> : <BookOpen size={15} aria-hidden="true" />}
                            {pending ? "Para registrar" : status === "presente" ? "Registrada" : lessonStatus[status].short}
                          </span>
                        </span>
                        {item.lesson?.theme && (
                          <span className="lr-theme">
                            <small>Tema</small> {item.lesson.theme}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            ) : dayItems.length ? (
              <p className="hint">Nenhuma aula neste filtro.</p>
            ) : (
              <Empty compact title="Nenhuma aula neste dia" mood="sleepy">
                {user.termStart || data.subjects.some((subject) => subject.startDate) ? "Escolha outro dia no calendário." : "Defina o semestre letivo em Configurações para gerar as aulas."}
              </Empty>
            )}
          </section>
        </div>
      )}

      {live && <LessonForm key={live.date + live.subject.id + live.start} occurrence={live} onClose={() => setOpen(null)} />}
      {extra && (
        <ExtraLesson
          onClose={() => setExtra(false)}
          onPick={(occurrence) => {
            setExtra(false);
            setOpen(occurrence);
          }}
        />
      )}
    </div>
  );
}

function ExtraLesson({ onClose, onPick }) {
  const { data } = useApp();
  const [error, setError] = useState("");
  return (
    <Modal title="Aula fora da grade" onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          const values = Object.fromEntries(new FormData(event.currentTarget));
          const subject = data.subjects.find((item) => item.id === values.subjectId);
          if (!subject) return setError("Escolha a disciplina.");
          const lesson = data.lessons.find((item) => item.subjectId === subject.id && item.date === values.date && item.startTime === values.start);
          onPick({ subject, date: values.date, start: values.start, end: "", room: "", lesson: lesson || null });
        }}
      >
        <SubjectSelect required />
        <div className="form-row">
          <label>
            Data
            <input type="date" name="date" required defaultValue={todayIso()} />
          </label>
          <label>
            Horário
            <input type="time" name="start" />
          </label>
        </div>
        <p className="hint">Use para reposições, aulas extras ou mudanças de horário. A grade da disciplina não muda.</p>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary">Continuar</button>
        </div>
      </form>
    </Modal>
  );
}

