import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Check, ExternalLink, MapPin, Trash2, Video } from "lucide-react";
import { useApp } from "../context.js";
import { todayIso } from "../lib/dates.js";
import { Avatar, FormError, Modal } from "../ui.jsx";

// Eventos da Comunidade (versão 4.2): estudo em grupo, revisão, live ou encontro. Quem cria já confirma presença.
const kindLabels = { estudo: "Estudo em grupo", revisao: "Revisão para prova", live: "Live", encontro: "Encontro" };
const monthShort = (iso) => new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)).replace(".", "");
const weekday = (iso) => new Intl.DateTimeFormat("pt-BR", { weekday: "long", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));
const relativeDay = (iso) => {
  const today = todayIso();
  const days = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
  if (days === 0) return "Hoje";
  if (days === 1) return "Amanhã";
  return weekday(iso).replace(/^./, (letter) => letter.toUpperCase());
};

export default function EventsCard({ creating, onCreating }) {
  const { call, toast, data } = useApp();
  const [state, setState] = useState({ status: "loading", items: [] });
  const [busy, setBusy] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await call("/comunidade/eventos");
      setState({ status: "ready", items: result.items });
    } catch {
      setState((current) => ({ ...current, status: "error" }));
    }
  }, [call]);
  useEffect(() => {
    load();
  }, [load]);
  const act = async (id, path, options) => {
    setBusy(id);
    try {
      const result = await call(path, options);
      setState({ status: "ready", items: result.items });
    } catch (failure) {
      toast(failure.message);
    } finally {
      setBusy("");
    }
  };
  const shown = state.items.slice(0, 4);
  return (
    <section className="hub-card hub-events" aria-labelledby="hub-events-title">
      <header>
        <h2 id="hub-events-title">Eventos da Comunidade</h2>
        <button type="button" className="btn soft small" onClick={() => onCreating(true)}>
          <CalendarPlus size={14} /> Criar
        </button>
      </header>
      {state.status === "loading" && <p className="hint">Carregando...</p>}
      {state.status === "error" && <p className="hint">Não deu para carregar os eventos agora.</p>}
      {state.status === "ready" && !shown.length && <p className="hint">Nenhum evento marcado. Chame a turma para estudar junto antes da próxima prova.</p>}
      {shown.length > 0 && (
        <ul className="event-list">
          {shown.map((event) => (
            <li key={event.id} className="event">
              <div className="event-date" aria-hidden="true">
                <b>{Number(event.date.slice(8))}</b>
                <span>{monthShort(event.date)}</span>
              </div>
              <div className="event-body">
                <small className={`event-kind kind-${event.kind}`}>{kindLabels[event.kind] || "Evento"}</small>
                <strong>{event.title}</strong>
                <p>
                  {relativeDay(event.date)}
                  {event.startTime ? ` · ${event.startTime}` : ""}
                  {event.subject ? ` · ${event.subject}` : ""}
                </p>
                {(event.place || event.link) && (
                  <p className="event-place">
                    {event.online ? <Video size={13} aria-hidden="true" /> : <MapPin size={13} aria-hidden="true" />} {event.place || "Link do encontro"}
                    {event.link && (
                      <a href={event.link} target="_blank" rel="noopener noreferrer">
                        Abrir <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    )}
                  </p>
                )}
                {event.details && <p className="event-details">{event.details}</p>}
                <div className="event-foot">
                  <span className="event-going">
                    <span className="event-faces" aria-hidden="true">
                      {event.going.slice(0, 4).map((person) => (
                        <Avatar key={person.id} user={person} size={24} />
                      ))}
                    </span>
                    {event.goingCount} {event.goingCount === 1 ? "vai" : "vão"}
                  </span>
                  {event.mine ? (
                    <button type="button" className="btn small ghost" disabled={busy === event.id} onClick={() => act(event.id, `/comunidade/eventos/${event.id}`, { method: "DELETE" })}>
                      <Trash2 size={14} /> Cancelar evento
                    </button>
                  ) : (
                    <button type="button" className={`btn small ${event.imGoing ? "soft" : "primary"}`} aria-pressed={event.imGoing} disabled={busy === event.id} onClick={() => act(event.id, `/comunidade/eventos/${event.id}/presenca`, { method: "POST", body: { going: !event.imGoing } })}>
                      {event.imGoing ? (
                        <>
                          <Check size={14} /> Vou
                        </>
                      ) : (
                        "Confirmar presença"
                      )}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {state.items.length > shown.length && <p className="hint">e mais {state.items.length - shown.length} marcados depois</p>}
      {creating && (
        <EventForm
          subjects={data.subjects}
          onClose={() => onCreating(false)}
          onSaved={(items) => {
            setState({ status: "ready", items });
            onCreating(false);
            toast("Evento criado. Você já está na lista.");
          }}
        />
      )}
    </section>
  );
}

function EventForm({ subjects, onClose, onSaved }) {
  const { call } = useApp();
  const [form, setForm] = useState({ kind: "estudo", title: "", subject: "", date: todayIso(), startTime: "19:00", online: true, place: "", link: "", details: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const save = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await call("/comunidade/eventos", { method: "POST", body: form });
      onSaved(result.items);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Criar evento de estudo" onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="paper-picker" role="radiogroup" aria-label="Tipo de evento">
          {Object.entries(kindLabels).map(([id, label]) => (
            <button key={id} type="button" role="radio" aria-checked={form.kind === id} className="chip-toggle" onClick={() => setForm({ ...form, kind: id })}>
              {label}
            </button>
          ))}
        </div>
        <label>
          Nome do evento
          <input value={form.title} maxLength={90} required onChange={set("title")} placeholder="Ex.: Revisão da P2 de Marketing" />
        </label>
        <label>
          Disciplina (opcional)
          <input value={form.subject} maxLength={80} onChange={set("subject")} list="event-subjects" />
          <datalist id="event-subjects">
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.name} />
            ))}
          </datalist>
        </label>
        <div className="form-row">
          <label>
            Dia
            <input type="date" value={form.date} min={todayIso()} required onChange={set("date")} />
          </label>
          <label>
            Horário
            <input type="time" value={form.startTime} onChange={set("startTime")} />
          </label>
        </div>
        <div className="paper-picker" role="radiogroup" aria-label="Onde">
          <button type="button" role="radio" aria-checked={form.online} className="chip-toggle" onClick={() => setForm({ ...form, online: true })}>
            On-line
          </button>
          <button type="button" role="radio" aria-checked={!form.online} className="chip-toggle" onClick={() => setForm({ ...form, online: false })}>
            Presencial
          </button>
        </div>
        <div className="form-row">
          <label>
            {form.online ? "Onde (ex.: Google Meet)" : "Local (ex.: Biblioteca, 2º andar)"}
            <input value={form.place} maxLength={80} onChange={set("place")} />
          </label>
          {form.online && (
            <label>
              Link (opcional)
              <input type="url" value={form.link} maxLength={300} onChange={set("link")} placeholder="https://meet.google.com/…" />
            </label>
          )}
        </div>
        <label>
          Detalhes (opcional)
          <textarea rows={3} value={form.details} maxLength={500} onChange={set("details")} placeholder="O que vamos estudar, o que levar…" />
        </label>
        <p className="hint">Todo mundo logado no Grimiau vê o evento. Você recebe um aviso quando alguém confirmar presença.</p>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Criando..." : "Criar evento"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
