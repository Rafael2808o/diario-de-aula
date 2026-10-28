import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useApp } from "../context.js";
import { addDays, addMonths, classOccurrences, endOfMonth, formatFull, formatLong, formatMonth, range, startOfMonth, startOfWeek, todayIso, weekdays } from "../lib/dates.js";
import { lessonStatus } from "../lib/domain.js";
import { Card, Empty, FormError, Modal, SubjectTag } from "../ui.jsx";
import { SubjectSelect } from "../components/forms.jsx";
import { LessonForm } from "../components/LessonForm.jsx";

function OccurrenceRow({ occurrence, onOpen }) {
  const status = occurrence.lesson?.status || "pendente";
  return (
    <button type="button" className="occurrence" style={{ "--subject": occurrence.subject.color }} onClick={() => onOpen(occurrence)}>
      <span className="subject-dot" aria-hidden="true" />
      <span>
        <strong>{occurrence.subject.name}</strong>
        <small>
          {formatLong(occurrence.date)}
          {occurrence.start ? `, ${occurrence.start}${occurrence.end ? `–${occurrence.end}` : ""}` : ""}
          {occurrence.lesson?.theme ? `, ${occurrence.lesson.theme}` : ""}
          {occurrence.lesson?.draft ? ", rascunho" : ""}
          {occurrence.extra ? ", fora da grade" : ""}
        </small>
      </span>
      <span className={`status status-${status}`}>{lessonStatus[status].short}</span>
    </button>
  );
}

export default function Lessons() {
  const { data, user, params } = useApp();
  const today = todayIso();
  const [cursor, setCursor] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date : today);
  const [selected, setSelected] = useState(cursor);
  const [open, setOpen] = useState(null);
  const [extra, setExtra] = useState(false);
  const monthStart = startOfWeek(startOfMonth(cursor));
  const monthEnd = addDays(startOfWeek(endOfMonth(cursor)), 6);
  const occurrences = useMemo(() => classOccurrences(data.subjects, data.lessons, user, monthStart, monthEnd), [data.subjects, data.lessons, user, monthStart, monthEnd]);
  const recent = useMemo(
    () => classOccurrences(data.subjects, data.lessons, user, addDays(today, -21), today).filter((item) => !item.lesson || item.lesson.draft).reverse(),
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

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Grimório Acadêmico</h1>
          <p>Cada aula da sua grade, com o que foi ensinado, faltas e materiais.</p>
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
        <div className="lessons-layout">
          <Card className="lessons-calendar">
            <div className="calendar-nav">
              <button className="icon-btn" aria-label="Mês anterior" onClick={() => setCursor(addMonths(cursor, -1))}>
                <ChevronLeft size={18} />
              </button>
              <h2>{formatMonth(cursor)}</h2>
              <button className="icon-btn" aria-label="Próximo mês" onClick={() => setCursor(addMonths(cursor, 1))}>
                <ChevronRight size={18} />
              </button>
              <button className="btn ghost small" onClick={() => { setCursor(today); setSelected(today); }}>
                Hoje
              </button>
            </div>
            <div className="mini-month">
              {weekdays.map((day) => (
                <span key={day} className="month-head">{day.slice(0, 1)}</span>
              ))}
              {range(monthStart, monthEnd).map((day) => {
                const items = occurrences.filter((item) => item.date === day);
                return (
                  <button
                    key={day}
                    type="button"
                    className={`${day.slice(0, 7) !== cursor.slice(0, 7) ? "outside" : ""} ${day === today ? "today" : ""} ${day === selected ? "picked" : ""}`}
                    onClick={() => setSelected(day)}
                    aria-label={`${formatLong(day)}: ${items.length} aulas`}
                  >
                    {Number(day.slice(8))}
                    <span className="dots" aria-hidden="true">
                      {items.slice(0, 3).map((item) => (
                        <i key={item.key} className={`dot status-dot-${item.lesson?.status || "pendente"}`} style={{ "--subject": item.subject.color }} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="hint legend">
              <i className="dot status-dot-pendente" /> pendente <i className="dot status-dot-presente" /> registrada <i className="dot status-dot-falta" /> falta <i className="dot status-dot-cancelada" /> cancelada
            </p>
          </Card>

          <Card title={formatLong(selected)}>
            {dayItems.length ? (
              <div className="occurrence-list">
                {dayItems.map((item) => (
                  <OccurrenceRow key={item.key} occurrence={item} onOpen={setOpen} />
                ))}
              </div>
            ) : (
              <Empty compact title="Nenhuma aula neste dia" mood="sleepy">
                {user.termStart || data.subjects.some((subject) => subject.startDate) ? "Escolha outro dia no calendário." : "Defina o semestre letivo em Configurações para gerar as aulas."}
              </Empty>
            )}
          </Card>

          <Card title="Para registrar" className="pending-card">
            {recent.length ? (
              <div className="occurrence-list">
                {recent.slice(0, 8).map((item) => (
                  <OccurrenceRow key={item.key} occurrence={item} onOpen={setOpen} />
                ))}
              </div>
            ) : (
              <Empty compact title="Tudo em dia" mood="happy">
                Nenhuma aula das últimas três semanas está sem registro.
              </Empty>
            )}
          </Card>
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

