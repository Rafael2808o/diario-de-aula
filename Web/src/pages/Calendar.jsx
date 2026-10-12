import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ClipboardPlus, Plus } from "lucide-react";
import { useApp } from "../context.js";
import {
  addDays,
  addMonths,
  endOfMonth,
  formatLong,
  formatMonth,
  formatShort,
  range,
  startOfMonth,
  startOfWeek,
  todayIso,
  weekdays,
} from "../lib/dates.js";
import { agendaItems, itemKinds, kindFilters } from "../lib/domain.js";
import { Confirm, Empty, Segmented } from "../ui.jsx";
import { EventForm, TaskForm } from "../components/forms.jsx";
import { LessonForm } from "../components/LessonForm.jsx";
import { AgendaRow } from "./Home.jsx";

const views = [
  ["mes", "Mês"],
  ["semana", "Semana"],
  ["dia", "Dia"],
  ["lista", "Lista"],
];

export default function Calendar() {
  const { data, user, params, go, remove, toast } = useApp();
  const today = todayIso();
  const [view, setView] = useState(views.some(([id]) => id === params.view) ? params.view : "mes");
  const [cursor, setCursor] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date : today);
  const [subjectId, setSubjectId] = useState("");
  const [kinds, setKinds] = useState(() => new Set(kindFilters.map(([id]) => id)));
  const [modal, setModal] = useState(null);

  const span = useMemo(() => {
    if (view === "mes") return [startOfWeek(startOfMonth(cursor)), addDays(startOfWeek(endOfMonth(cursor)), 6)];
    if (view === "semana") return [startOfWeek(cursor), addDays(startOfWeek(cursor), 6)];
    if (view === "dia") return [cursor, cursor];
    return [cursor, addDays(cursor, 60)];
  }, [view, cursor]);

  const items = useMemo(
    () => agendaItems(data, user, span[0], span[1]).filter((item) => kinds.has(item.kind) && (!subjectId || item.subject?.id === subjectId)),
    [data, user, span, kinds, subjectId],
  );
  const byDay = useMemo(() => {
    const map = {};
    for (const item of items) (map[item.date] ||= []).push(item);
    return map;
  }, [items]);

  const step = (direction) => {
    if (view === "mes") setCursor(addMonths(cursor, direction));
    else if (view === "semana") setCursor(addDays(cursor, 7 * direction));
    else setCursor(addDays(cursor, direction * (view === "lista" ? 30 : 1)));
  };
  const title =
    view === "mes"
      ? formatMonth(cursor)
      : view === "semana"
        ? `${formatShort(span[0])} a ${formatShort(span[1])}`
        : view === "dia"
          ? formatLong(cursor)
          : `A partir de ${formatShort(cursor)}`;

  const open = (item) => {
    if (item.kind === "aula") setModal({ type: "lesson", occurrence: item.occurrence });
    else if (item.kind === "prova") go("provas", { id: item.record.id });
    else if (item.kind === "entrega") setModal({ type: "task", task: item.record });
    else if (item.legacy) setModal({ type: "legacy", plan: item.record });
    else setModal({ type: "event", event: item.record });
  };
  const toggleKind = (id) =>
    setKinds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const noSchedule = data.subjects.length > 0 && !data.subjects.some((subject) => subject.schedule.length && (subject.startDate || user.termStart));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Calendário</h1>
        </div>
        <div className="page-actions">
          <button className="btn soft" onClick={() => setModal({ type: "task", defaults: { date: cursor } })}>
            <ClipboardPlus size={16} /> Atividade
          </button>
          <button className="btn primary" onClick={() => setModal({ type: "event", defaults: { date: cursor } })}>
            <Plus size={16} /> Novo evento
          </button>
        </div>
      </header>

      {noSchedule && (
        <p className="notice">
          Suas aulas ainda não aparecem porque falta o período letivo. Informe o mês de início e fim em{" "}
          <button className="link-btn" onClick={() => go("configuracoes")}>Configurações</button> ou as datas em cada disciplina.
        </p>
      )}

      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button className="icon-btn" aria-label="Anterior" onClick={() => step(-1)}>
            <ChevronLeft size={18} />
          </button>
          <button className="btn ghost small" onClick={() => setCursor(today)}>
            Hoje
          </button>
          <button className="icon-btn" aria-label="Próximo" onClick={() => step(1)}>
            <ChevronRight size={18} />
          </button>
          <h2>{title}</h2>
        </div>
        <Segmented label="Visualização" value={view} onChange={setView} options={views} />
      </div>

      <div className="filters">
        <select aria-label="Filtrar por disciplina" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          <option value="">Todas as disciplinas</option>
          {data.subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
        {kindFilters.map(([id, label]) => {
          const Icon = itemKinds[id].icon;
          return (
            <button key={id} type="button" className={`chip ${kinds.has(id) ? "active" : ""}`} aria-pressed={kinds.has(id)} onClick={() => toggleKind(id)}>
              <Icon size={14} /> {label}
            </button>
          );
        })}
      </div>

      {view === "mes" && (
        <div className="month" role="grid" aria-label={title}>
          {weekdays.map((day) => (
            <span key={day} className="month-head" role="columnheader">
              {day}
            </span>
          ))}
          {range(span[0], span[1]).map((day) => {
            const dayItems = byDay[day] || [];
            return (
              <div key={day} role="gridcell" className={`month-cell ${day.slice(0, 7) !== cursor.slice(0, 7) ? "outside" : ""} ${day === today ? "today" : ""}`}>
                <button type="button" className="month-day" onClick={() => { setCursor(day); setView("dia"); }} aria-label={`${formatLong(day)}, ${dayItems.length} itens`}>
                  {Number(day.slice(8))}
                </button>
                <div className="month-items">
                  {dayItems.slice(0, 3).map((item) => {
                    const Icon = itemKinds[item.kind].icon;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`month-item kind-${item.kind} ${item.status === "cancelada" ? "cancelled" : ""}`}
                        style={{ "--subject": item.subject?.color || "var(--accent)" }}
                        onClick={() => open(item)}
                        title={`${itemKinds[item.kind].label}: ${item.title}`}
                      >
                        <Icon size={11} aria-hidden="true" />
                        <span>{item.title}</span>
                      </button>
                    );
                  })}
                  {dayItems.length > 3 && (
                    <button type="button" className="month-more" onClick={() => { setCursor(day); setView("dia"); }}>
                      +{dayItems.length - 3}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "semana" && (
        <div className="week-columns">
          {range(span[0], span[1]).map((day) => (
            <section key={day} className={day === today ? "is-today" : ""}>
              <button type="button" className="week-day-head" onClick={() => { setCursor(day); setView("dia"); }}>
                <small>{weekdays[new Date(`${day}T12:00:00Z`).getUTCDay()]}</small>
                <strong>{Number(day.slice(8))}</strong>
              </button>
              <div className="week-items">
                {(byDay[day] || []).map((item) => (
                  <button key={item.id} type="button" className={`week-item kind-${item.kind} ${item.status === "cancelada" || item.done ? "is-muted" : ""}`} style={{ "--subject": item.subject?.color || "var(--accent)" }} onClick={() => open(item)}>
                    <span>{item.start || "Dia todo"}</span>
                    <strong>{item.title}</strong>
                    <small>{itemKinds[item.kind].label}</small>
                  </button>
                ))}
                {!(byDay[day] || []).length && <p className="quiet">Livre</p>}
              </div>
            </section>
          ))}
        </div>
      )}

      {(view === "dia" || view === "lista") && (
        <div className="day-view">
          {items.length ? (
            view === "dia" ? (
              <div className="group">
                {items.map((item) => (
                  <AgendaRow key={item.id} item={item} onOpen={open} />
                ))}
              </div>
            ) : (
              Object.entries(byDay).map(([day, dayItems]) => (
                <section key={day} className="list-day">
                  <h3>{formatLong(day)}</h3>
                  <div className="group">
                    {dayItems.map((item) => (
                      <AgendaRow key={item.id} item={item} onOpen={open} />
                    ))}
                  </div>
                </section>
              ))
            )
          ) : (
            <Empty compact title={view === "dia" ? "Nada neste dia" : "Nenhum evento nos próximos 60 dias"} mood="sleepy">
              Crie um evento ou cadastre provas e atividades para preencher a agenda.
            </Empty>
          )}
        </div>
      )}

      {modal?.type === "lesson" && <LessonForm occurrence={modal.occurrence} onClose={() => setModal(null)} />}
      {modal?.type === "task" && (
        <TaskForm
          task={modal.task}
          defaults={modal.defaults}
          onClose={() => setModal(null)}
          onDelete={modal.task && (() => setModal({ type: "confirm", name: "tasks", record: modal.task }))}
        />
      )}
      {modal?.type === "event" && (
        <EventForm
          event={modal.event}
          defaults={modal.defaults}
          onClose={() => setModal(null)}
          onDelete={modal.event && (() => setModal({ type: "confirm", name: "events", record: modal.event }))}
        />
      )}
      {modal?.type === "legacy" && (
        <Confirm
          title="Estudo planejado"
          message={`“${modal.plan.topic}” (${modal.plan.subject}) foi planejado na versão anterior do app. Deseja marcar como concluído e removê-lo da agenda?`}
          confirmLabel="Concluir e remover"
          onConfirm={async () => {
            await remove("study-plans", modal.plan.id);
            toast("Estudo concluído.");
          }}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "confirm" && (
        <Confirm
          title="Excluir do calendário?"
          message={`“${modal.record.title}” será excluído permanentemente.`}
          onConfirm={async () => {
            await remove(modal.name, modal.record.id);
            toast("Excluído do calendário.");
          }}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
