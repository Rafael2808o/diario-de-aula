import { useCallback, useEffect, useState } from "react";
import { Check, Dices, Plus, Settings2, Trash2, UserX, X } from "lucide-react";
import { useApp } from "../../context.js";
import { formatShort, todayIso } from "../../lib/dates.js";
import { Avatar, Confirm, FormError, Modal } from "../../ui.jsx";

// Demandas da aula: cada integrante presente recebe uma função diferente (fotografar slides, gravar, registrar…),
// em rodízio. O sorteio é feito no servidor; aqui só mostramos, marcamos como feito, trocamos e registramos faltas.

function DutyTypes({ activity, state, onClose, onSaved }) {
  const { call } = useApp();
  const [names, setNames] = useState(state.duties.length ? state.duties.map((duty) => duty.name) : state.suggestions);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const add = () => {
    const name = draft.trim();
    if (name.length < 2 || names.some((item) => item.toLowerCase() === name.toLowerCase())) return;
    setNames([...names, name]);
    setDraft("");
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      onSaved(await call(`/shared/${activity.id}/demandas/tipos`, { method: "PUT", body: { names } }));
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Funções do grupo" onClose={onClose}>
      <div className="form">
        <p className="hint">Em cada aula, cada função vai para uma pessoa diferente. Tirar uma função daqui não apaga o histórico.</p>
        <ul className="duty-names">
          {names.map((name) => (
            <li key={name}>
              <span>{name}</span>
              <button type="button" className="icon-btn" aria-label={`Tirar ${name}`} onClick={() => setNames(names.filter((item) => item !== name))}>
                <X size={14} />
              </button>
            </li>
          ))}
        </ul>
        <div className="duty-add">
          <label className="grow">
            Nova função
            <input
              value={draft}
              maxLength={60}
              placeholder="Ex.: Anotar as datas que o professor falar"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
            />
          </label>
          <button type="button" className="btn soft" onClick={add} disabled={draft.trim().length < 2 || names.length >= 8}>
            <Plus size={15} /> Adicionar
          </button>
        </div>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" onClick={save} disabled={busy || !names.length}>
            {busy ? "Salvando..." : "Salvar funções"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function NewRound({ activity, onClose, onSaved }) {
  const { call } = useApp();
  const members = activity.members.filter((member) => !member.removed);
  const [date, setDate] = useState(todayIso());
  const [label, setLabel] = useState("");
  const [present, setPresent] = useState(members.map((member) => member.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSaved(await call(`/shared/${activity.id}/demandas/aulas`, { method: "POST", body: { date, label, presentIds: present } }));
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };
  return (
    <Modal title="Sortear funções da aula" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <div className="form-row">
          <label>
            Data
            <input type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            Aula
            <input value={label} maxLength={80} placeholder="Ex.: Aula do professor Khan" onChange={(event) => setLabel(event.target.value)} />
          </label>
        </div>
        <fieldset className="plain-fieldset">
          <legend>Quem está na aula</legend>
          <div className="assignee-picker">
            {members.map((member) => {
              const chosen = present.includes(member.id);
              return (
                <button key={member.id} type="button" className={`person-chip ${chosen ? "active" : ""}`} aria-pressed={chosen} onClick={() => setPresent(chosen ? present.filter((id) => id !== member.id) : [...present, member.id])}>
                  <Avatar user={member} size={22} /> {member.me ? "Você" : member.name} {chosen && <Check size={14} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </fieldset>
        <p className="hint">Quem faltar não recebe função. Quem fez uma função por último vai para o fim da fila dela.</p>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !present.length}>
            <Dices size={15} /> {busy ? "Sorteando..." : "Sortear"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Round({ round, activity, onChange }) {
  const { call, toast } = useApp();
  const [swapping, setSwapping] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const act = async (request, message) => {
    try {
      onChange(await request());
      if (message) toast(message);
    } catch (failure) {
      toast(failure.message);
    }
  };
  const done = round.items.filter((item) => item.done).length;
  return (
    <article className="duty-round paper-card">
      <header className="duty-round-head">
        <div>
          <p className="paper-label">{formatShort(round.date)}</p>
          <h3>{round.label || "Aula"}</h3>
        </div>
        <span className="stamp mint">
          {done} de {round.items.length} feitas
        </span>
      </header>
      <ul className="duty-items">
        {round.items.map((item) => (
          <li key={item.id} className={item.done ? "is-done" : ""}>
            <div className="duty-item-main">
              <strong>{item.duty}</strong>
              {item.person ? (
                <span className="task-assignee">
                  <Avatar user={item.person} size={22} /> {item.mine ? "Você" : item.person.name}
                </span>
              ) : (
                <span className="quiet">Sem responsável</span>
              )}
            </div>
            {!activity.closed && (
              <div className="duty-item-actions">
                {item.person && <button type="button" className={`btn small ${item.done ? "soft" : "primary"}`} aria-pressed={item.done} onClick={() => act(() => call(`/shared/${activity.id}/demandas/itens/${item.id}`, { method: "PATCH", body: { done: !item.done } }))}>
                  <Check size={14} /> {item.done ? "Feito" : "Marcar feito"}
                </button>}
                <button type="button" className="btn small soft" onClick={() => setSwapping(item)}>
                  {item.person ? "Trocar" : "Escolher alguém"}
                </button>
                {item.person && !item.done && (
                  <button type="button" className="btn small soft" onClick={() => act(() => call(`/shared/${activity.id}/demandas/aulas/${round.id}/faltou`, { method: "POST", body: { userId: item.person.id } }), `${item.mine ? "Sua falta" : `Falta de ${item.person.name}`} registrada; a função foi para outra pessoa.`)}>
                    <UserX size={14} /> Faltou
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <footer className="duty-round-foot">
        <small className="quiet">Presentes: {round.present.map((person) => person.name).join(", ") || "ninguém"}</small>
        {!activity.closed && (
          <button type="button" className="icon-btn" aria-label="Apagar esta aula" onClick={() => setDeleting(true)}>
            <Trash2 size={14} />
          </button>
        )}
      </footer>
      {swapping && (
        <Modal title={`Quem faz: ${swapping.duty}?`} onClose={() => setSwapping(null)}>
          <p className="hint">Só aparece quem está presente. Se a pessoa já tinha outra função, as duas trocam.</p>
          <div className="assignee-picker">
            {round.present.map((person) => (
              <button
                key={person.id}
                type="button"
                className={`person-chip ${swapping.person?.id === person.id ? "active" : ""}`}
                onClick={() => act(() => call(`/shared/${activity.id}/demandas/itens/${swapping.id}`, { method: "PATCH", body: { userId: person.id } }), "Função trocada.").then(() => setSwapping(null))}
              >
                <Avatar user={person} size={22} /> {person.name}
              </button>
            ))}
          </div>
        </Modal>
      )}
      {deleting && (
        <Confirm
          title="Apagar esta aula?"
          message="A distribuição desta aula sai da lista para todo o grupo e deixa de contar no rodízio."
          onConfirm={() => act(() => call(`/shared/${activity.id}/demandas/aulas/${round.id}`, { method: "DELETE" }), "Aula apagada.")}
          onClose={() => setDeleting(false)}
        />
      )}
    </article>
  );
}

export default function Duties({ activity }) {
  const { call } = useApp();
  const [state, setState] = useState(null);
  const [modal, setModal] = useState(null);
  const load = useCallback(() => call(`/shared/${activity.id}/demandas`).then(setState).catch(() => setState((current) => current || { duties: [], rounds: [], suggestions: [] })), [call, activity.id]);
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    return () => clearInterval(timer);
  }, [load]);
  const saved = (next) => {
    setState(next);
    setModal(null);
  };
  return (
    <section className="sala-duties" aria-labelledby="demandas-title">
      <div className="section-head">
        <h2 id="demandas-title" className="section-title">
          Demandas da aula
        </h2>
        {state && !activity.closed && (
          <div className="duty-head-actions">
            <button type="button" className="btn small soft" onClick={() => setModal("types")}>
              <Settings2 size={14} /> Funções
            </button>
            {state.duties.length > 0 && (
              <button type="button" className="btn small primary" onClick={() => setModal("round")}>
                <Dices size={14} /> Sortear aula
              </button>
            )}
          </div>
        )}
      </div>
      {state === null ? (
        <p className="quiet">Carregando…</p>
      ) : !state.duties.length && !state.rounds.length ? (
        <div className="duty-empty paper-card">
          <p>Dividam as tarefas de cada aula: uma pessoa fotografa os slides, outra grava, outra registra no Caderno. A cada aula as funções rodam entre quem está presente.</p>
          {!activity.closed && (
            <button type="button" className="btn primary" onClick={() => setModal("types")}>
              Escolher as funções do grupo
            </button>
          )}
        </div>
      ) : state.rounds.length ? (
        <div className="duty-rounds">
          {state.rounds.slice(0, 3).map((round) => (
            <Round key={round.id} round={round} activity={activity} onChange={setState} />
          ))}
        </div>
      ) : (
        <p className="hint">Funções prontas: {state.duties.map((duty) => duty.name).join(", ")}. Toque em “Sortear aula” quando a aula começar.</p>
      )}
      {modal === "types" && <DutyTypes activity={activity} state={state} onClose={() => setModal(null)} onSaved={saved} />}
      {modal === "round" && <NewRound activity={activity} onClose={() => setModal(null)} onSaved={saved} />}
    </section>
  );
}
