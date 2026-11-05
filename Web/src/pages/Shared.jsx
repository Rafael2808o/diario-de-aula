import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, Copy, ExternalLink, FileText, KeyRound, Link2, Lock, Pencil, Plus, RefreshCw, Shuffle, UserMinus, UserPlus, Users } from "lucide-react";
import { useApp } from "../context.js";
import { formatFull, todayIso } from "../lib/dates.js";
import { Avatar, Confirm, Empty, FormError, Modal, Segmented, useSubmit } from "../ui.jsx";
import { PeopleList, PeoplePicker } from "../components/sala/People.jsx";
import Board from "../components/sala/Board.jsx";
import GroupCall from "../components/sala/Call.jsx";

// Sala de Estudos 📚 (antigas Atividades compartilhadas): os trabalhos antigos continuam aqui, com os mesmos dados.
const statuses = ["Pendente", "Em andamento", "Concluída"];
const statusClass = { Pendente: "is-pending", "Em andamento": "is-doing", Concluída: "is-done" };
const inviteLink = (code) => `${window.location.origin}/?abrir=compartilhadas&codigo=${code}`;
const dueText = (activity) => (activity.dueDate ? `${formatFull(activity.dueDate)}${activity.dueTime ? ` às ${activity.dueTime}` : ""}` : "Sem data de entrega");
const profileSkipKey = "grimiau.sala.perfil-depois";

// ---------- Perfil acadêmico ----------
function AcademicProfile({ initial, onClose, onSaved }) {
  const { call, user } = useApp();
  const [form, setForm] = useState({ fullName: initial?.fullName || user.name || "", ra: initial?.ra || "", hasAgency: Boolean(initial?.hasAgency) });
  const [agency, setAgency] = useState(initial?.agency || []);
  const { submit, busy, error } = useSubmit(() => call("/sala/perfil", { method: "PUT", body: { ...form, agency: agency.map((person) => person.id) } }), { success: "Perfil acadêmico salvo.", onDone: onSaved });
  return (
    <Modal title={initial?.done ? "Meu perfil acadêmico" : "Vamos completar seu perfil acadêmico? ✨"} onClose={onClose}>
      <form className="form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label>
          Nome completo
          <input value={form.fullName} maxLength={120} required onChange={(event) => setForm({ ...form, fullName: event.target.value })} autoComplete="name" />
        </label>
        <label>
          RA
          <input value={form.ra} maxLength={30} inputMode="numeric" onChange={(event) => setForm({ ...form, ra: event.target.value })} placeholder="Seu registro acadêmico" />
        </label>
        <fieldset>
          <legend>Você já tem uma agência montada?</legend>
          <Segmented label="Agência montada" value={form.hasAgency ? "Sim" : "Não"} onChange={(value) => setForm({ ...form, hasAgency: value === "Sim" })} options={["Sim", "Não"]} />
        </fieldset>
        {form.hasAgency ? (
          <PeoplePicker value={agency} onChange={setAgency} max={20} label="Buscar integrante da agência" />
        ) : (
          <p className="hint">Tudo bem! Você pode montar grupos depois, em cada trabalho.</p>
        )}
        <p className="hint">Nome completo e RA aparecem só para quem faz trabalho com você, na lista de integrantes.</p>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            {initial?.done ? "Cancelar" : "Agora não"}
          </button>
          <button className="btn primary" disabled={busy || form.fullName.trim().length < 3}>
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Cadastro do trabalho ----------
function WorkForm({ activity, profile, onClose, onSaved }) {
  const { call, data, toast } = useApp();
  const [form, setForm] = useState({
    title: activity?.title || "",
    subjectName: activity?.subjectName || "",
    description: activity?.description || "",
    dueDate: activity?.dueDate || "",
    dueTime: activity?.dueTime || "",
    teamSize: activity?.teamSize || 3,
    agency: activity ? activity.agency : Boolean(profile?.hasAgency && profile.agency.length),
  });
  const [mode, setMode] = useState("Sortear");
  const [people, setPeople] = useState(() => (!activity && profile?.hasAgency ? profile.agency : []));
  const [drawInfo, setDrawInfo] = useState("");
  const [drawing, setDrawing] = useState(false);
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const want = Math.max(0, Number(form.teamSize) - 1);

  const draw = async () => {
    setDrawing(true);
    try {
      const result = await call("/sala/sorteio", { method: "POST", body: { count: Math.max(1, want) } });
      setPeople(result.people);
      setDrawInfo(result.people.length < want ? `Só ${result.people.length} ${result.people.length === 1 ? "colega encontrado" : "colegas encontrados"} no seu curso.` : "");
    } catch (failure) {
      setDrawInfo(failure.message);
    } finally {
      setDrawing(false);
    }
  };

  const { submit, busy, error } = useSubmit(async () => {
    const body = { ...form, teamSize: Number(form.teamSize) || 0 };
    if (activity) return call(`/shared/${activity.id}`, { method: "PATCH", body });
    const created = await call("/shared", { method: "POST", body });
    if (people.length) return call(`/shared/${created.id}/members`, { method: "POST", body: { userIds: people.map((person) => person.id) } });
    return created;
  }, { onDone: onSaved });

  return (
    <Modal title={activity ? "Editar trabalho" : "Cadastrar novo trabalho"} onClose={onClose} wide>
      <form className="form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label>
          Nome do trabalho
          <input value={form.title} required maxLength={160} onChange={set("title")} placeholder="Ex.: Seminário de Ética" />
        </label>
        <div className="form-row">
          <label>
            Disciplina
            <input value={form.subjectName} maxLength={100} list="sala-subjects" onChange={set("subjectName")} />
            <datalist id="sala-subjects">
              {data.subjects.map((subject) => (
                <option key={subject.id} value={subject.name} />
              ))}
            </datalist>
          </label>
          <label>
            Quantidade de integrantes
            <input type="number" min={1} max={30} value={form.teamSize} onChange={set("teamSize")} />
          </label>
        </div>
        <label>
          Descrição
          <textarea value={form.description} rows={3} maxLength={4000} onChange={set("description")} placeholder="O que precisa ser entregue e os combinados do grupo." />
        </label>
        <div className="form-row">
          <label>
            Data de entrega
            <input type="date" value={form.dueDate} onChange={set("dueDate")} />
          </label>
          <label>
            Horário de entrega
            <input type="time" value={form.dueTime} onChange={set("dueTime")} />
          </label>
        </div>
        {!activity && (
          <>
            <fieldset>
              <legend>Esse trabalho será feito em agência?</legend>
              <Segmented
                label="Feito em agência"
                value={form.agency ? "Sim" : "Não"}
                onChange={(value) => {
                  const agency = value === "Sim";
                  setForm({ ...form, agency });
                  setPeople(agency ? profile?.agency || [] : []);
                  setDrawInfo("");
                }}
                options={["Sim", "Não"]}
              />
            </fieldset>
            {form.agency ? (
              profile?.agency?.length ? (
                <div className="sala-agency">
                  <p className="hint">Confirme quem da sua agência participa deste trabalho:</p>
                  <ul className="people-list">
                    {profile.agency.map((person) => {
                      const on = people.some((item) => item.id === person.id);
                      return (
                        <li key={person.id}>
                          <label className="check">
                            <input type="checkbox" checked={on} onChange={() => setPeople(on ? people.filter((item) => item.id !== person.id) : [...people, person])} />
                            <Avatar user={person} size={30} /> {person.name}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="hint">Sua agência ainda não tem integrantes. Monte em “Meu perfil acadêmico” ou escolha os colegas abaixo.</p>
              )
            ) : (
              <>
                <Segmented label="Como formar o grupo" value={mode} onChange={(value) => { setMode(value); setPeople([]); setDrawInfo(""); }} options={["Sortear", "Escolher"]} />
                {mode === "Sortear" ? (
                  <div className="sala-draw">
                    <button type="button" className="btn" disabled={drawing || want < 1} onClick={draw}>
                      {people.length ? <RefreshCw size={15} /> : <Shuffle size={15} />} {drawing ? "Sorteando..." : people.length ? "Sortear de novo" : `Sortear ${want} ${want === 1 ? "colega" : "colegas"}`}
                    </button>
                    {drawInfo && <p className="hint">{drawInfo}</p>}
                    <PeopleList people={people} />
                    {people.length > 0 && <p className="hint">Gostou da combinação? Ela é confirmada quando você cadastrar o trabalho.</p>}
                  </div>
                ) : (
                  <PeoplePicker value={people} onChange={setPeople} max={want || 29} />
                )}
              </>
            )}
            {form.agency && profile?.agency?.length > 0 && people.length < want && <PeoplePicker value={people} onChange={setPeople} max={want || 29} label="Adicionar mais alguém" />}
          </>
        )}
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Salvando..." : activity ? "Salvar para todos" : people.length ? `Cadastrar e avisar ${people.length === 1 ? "1 colega" : `${people.length} colegas`}` : "Cadastrar trabalho"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function JoinForm({ initialCode, onClose, onJoined }) {
  const { call } = useApp();
  const { submit, busy, error } = useSubmit((code) => call("/shared/join", { method: "POST", body: { code } }), { onDone: onJoined });
  return (
    <Modal title="Entrar com código" onClose={onClose}>
      <form className="form" onSubmit={(event) => { event.preventDefault(); submit(String(new FormData(event.currentTarget).get("code") || "")); }}>
        <label>
          Código de convite
          <input name="code" required maxLength={12} defaultValue={initialCode} autoCapitalize="characters" autoComplete="off" placeholder="Ex.: K7M2QX9A" className="code-input" />
          <small className="hint">Peça o código a quem cadastrou o trabalho.</small>
        </label>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Entrando..." : "Entrar no trabalho"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------- Documento do trabalho ----------
function DocumentLink({ activity, onChange }) {
  const { call, toast } = useApp();
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState(activity.docUrl);
  const { submit, busy, error } = useSubmit(() => call(`/shared/${activity.id}/documento`, { method: "PUT", body: { url } }), {
    onDone: (next) => {
      setEditing(false);
      toast(url ? "Link do documento salvo." : "Link do documento removido.");
      onChange(next);
    },
  });
  const valid = !url.trim() || /^https?:\/\/\S+\.\S+/i.test(url.trim());
  return (
    <section className="sala-doc" aria-labelledby="documento-title">
      <h2 id="documento-title" className="section-title">
        <FileText size={16} aria-hidden="true" /> Documento do trabalho
      </h2>
      {!editing && activity.docUrl ? (
        <div className="sala-doc-link">
          <a className="btn primary" href={activity.docUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={15} /> Abrir documento
          </a>
          <span className="sala-doc-host">{new URL(activity.docUrl).hostname.replace(/^www\./, "")}</span>
          {!activity.closed && (
            <button type="button" className="btn small ghost" onClick={() => { setUrl(activity.docUrl); setEditing(true); }}>
              <Pencil size={14} /> Editar link
            </button>
          )}
        </div>
      ) : editing ? (
        <form className="form" onSubmit={(event) => { event.preventDefault(); if (valid) submit(); }}>
          <p className="hint">Adicione o link do Google Docs ou de outro documento compartilhado para que todos os integrantes encontrem o arquivo facilmente.</p>
          <label>
            Link do documento
            <input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="Cole aqui o link do documento (opcional)" inputMode="url" />
          </label>
          {!valid && <p className="form-error">Cole um link completo, começando com https://.</p>}
          <FormError>{error}</FormError>
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <button className="btn primary" disabled={busy || !valid}>
              {busy ? "Salvando..." : "Salvar link"}
            </button>
          </div>
          <p className="hint">O documento abre no serviço dele; o Grimiau só guarda o link. Quem edita depende das permissões que o dono do documento deu.</p>
        </form>
      ) : (
        <button type="button" className="btn soft" disabled={activity.closed} onClick={() => setEditing(true)}>
          <Link2 size={15} /> Adicionar documento
        </button>
      )}
    </section>
  );
}

// ---------- Integrantes ----------
function Members({ activity, onChange }) {
  const { call, toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [newPeople, setNewPeople] = useState([]);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = activity.members.find((member) => member.me);
  const act = async (action, message) => {
    setBusy(true);
    try {
      const result = await action();
      if (message) toast(message);
      await onChange(result);
    } catch (failure) {
      toast(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const copyList = async () => {
    try {
      const { text } = await call(`/shared/${activity.id}/lista`);
      await navigator.clipboard.writeText(text);
      toast("Lista de integrantes copiada.");
    } catch (failure) {
      toast(failure.message || "Não foi possível copiar a lista.");
    }
  };
  return (
    <section className="sala-members" aria-labelledby="integrantes-title">
      <div className="section-head">
        <h2 id="integrantes-title" className="section-title">
          Integrantes <small className="quiet">· {activity.members.length}{activity.teamSize ? ` de ${activity.teamSize}` : ""}</small>
        </h2>
        <button type="button" className="btn small" onClick={copyList}>
          <ClipboardList size={14} /> Copiar lista de integrantes
        </button>
      </div>
      <ul className="shared-members">
        {activity.members.map((member) => (
          <li key={member.id}>
            <Avatar user={member} size={28} />
            <span>
              {member.name}
              {member.owner ? " (cadastrou)" : ""}
              {member.me ? " · você" : ""}
            </span>
            <span className={`member-status ${statusClass[member.status]}`}>{member.status}</span>
            {activity.owner && !member.owner && !activity.closed && (
              <button className="icon-btn" aria-label={`Remover ${member.name}`} onClick={() => setConfirm({ type: "remove", member })}>
                <UserMinus size={14} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {me && !activity.closed && (
        <div className="shared-mine">
          <span>Minha parte</span>
          <Segmented label="Meu status" value={me.status} onChange={(status) => !busy && act(() => call(`/shared/${activity.id}/status`, { method: "PUT", body: { status } }), status === "Concluída" ? "Parte concluída. Os colegas foram avisados." : "")} options={statuses} />
        </div>
      )}
      {activity.owner && !activity.closed && (
        <>
          {adding ? (
            <div className="sala-add">
              <PeoplePicker value={newPeople} onChange={setNewPeople} label="Buscar colega para adicionar" />
              <div className="form-actions">
                <button type="button" className="btn" onClick={() => { setAdding(false); setNewPeople([]); }}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !newPeople.length}
                  onClick={() => act(() => call(`/shared/${activity.id}/members`, { method: "POST", body: { userIds: newPeople.map((person) => person.id) } }), "Integrantes adicionados e avisados.").then(() => { setAdding(false); setNewPeople([]); })}
                >
                  Adicionar
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="link-btn" onClick={() => setAdding(true)}>
              <UserPlus size={14} /> Adicionar integrantes
            </button>
          )}
          <div className="shared-invite">
            <KeyRound size={15} aria-hidden="true" />
            <span>
              Código de convite: <code>{activity.inviteCode}</code>
            </span>
            <button
              className="btn ghost small"
              onClick={() =>
                navigator.clipboard
                  ?.writeText(`Entre no trabalho "${activity.title}" na Sala de Estudos do Grimiau: ${inviteLink(activity.inviteCode)} (código ${activity.inviteCode})`)
                  .then(() => toast("Convite copiado."))
                  .catch(() => toast(`Código: ${activity.inviteCode}`))
              }
            >
              <Copy size={14} /> Copiar convite
            </button>
          </div>
        </>
      )}
      {confirm?.type === "remove" && (
        <Confirm
          title="Remover integrante"
          message={`${confirm.member.name} deixa de ver este trabalho.`}
          confirmLabel="Remover"
          onClose={() => setConfirm(null)}
          onConfirm={() => act(() => call(`/shared/${activity.id}/members/${confirm.member.id}`, { method: "DELETE" }), "Integrante removido.")}
        />
      )}
    </section>
  );
}

function WorkDetail({ activity, onChange, onEdit, onLeft }) {
  const { call, go, toast } = useApp();
  const [confirm, setConfirm] = useState(null);
  const me = activity.members.find((member) => member.me);
  return (
    <div className="sala-detail">
      <button className="link-btn back" onClick={() => go("compartilhadas")}>
        <ArrowLeft size={15} /> Sala de Estudos
      </button>
      <header className="page-head">
        <div>
          {activity.subjectName && <span className="summary-subject">{activity.subjectName}</span>}
          <h1>{activity.title}</h1>
          <p>
            Entrega: {dueText(activity)}
            {activity.closed && (
              <span className="badge">
                <Lock size={12} /> Encerrado
              </span>
            )}
          </p>
        </div>
        {activity.owner && !activity.closed && (
          <div className="page-actions">
            <button className="btn" onClick={() => onEdit(activity)}>
              <Pencil size={15} /> Editar
            </button>
          </div>
        )}
      </header>
      {activity.description && <p className="prewrap sala-description">{activity.description}</p>}
      {activity.materials && (
        <p className="prewrap shared-materials">
          <strong>Materiais:</strong> {activity.materials}
        </p>
      )}
      <DocumentLink activity={activity} onChange={onChange} />
      <Board activity={activity} />
      <div className="sala-columns">
        <Members activity={activity} onChange={onChange} />
        <GroupCall activity={activity} />
      </div>
      <footer className="sala-footer">
        {activity.owner ? (
          <button className="link-btn" onClick={() => (activity.closed ? call(`/shared/${activity.id}/close`, { method: "POST", body: { closed: false } }).then(onChange) : setConfirm("close"))}>
            {activity.closed ? "Reabrir trabalho" : "Encerrar trabalho"}
          </button>
        ) : (
          <button className="link-btn" onClick={() => setConfirm("leave")}>
            Sair do trabalho
          </button>
        )}
      </footer>
      {confirm === "close" && (
        <Confirm
          title="Encerrar trabalho"
          message="Ninguém mais entra com o código e o quadro fica só para consulta. Nada é apagado e dá para reabrir depois."
          confirmLabel="Encerrar"
          onClose={() => setConfirm(null)}
          onConfirm={async () => onChange(await call(`/shared/${activity.id}/close`, { method: "POST", body: { closed: true } }))}
        />
      )}
      {confirm === "leave" && (
        <Confirm
          title="Sair do trabalho"
          message="Você deixa de ver este trabalho. Para voltar, peça para quem cadastrou."
          confirmLabel="Sair"
          onClose={() => setConfirm(null)}
          onConfirm={async () => {
            await call(`/shared/${activity.id}/members/${me.id}`, { method: "DELETE" });
            toast("Você saiu do trabalho.");
            onLeft();
          }}
        />
      )}
    </div>
  );
}

function workProgress(activity) {
  const done = activity.members.filter((member) => member.status === "Concluída").length;
  return activity.members.length ? Math.round((done / activity.members.length) * 100) : 0;
}

function WorkRow({ activity }) {
  const { go } = useApp();
  const progress = workProgress(activity);
  const late = activity.dueDate && activity.dueDate < todayIso() && progress < 100 && !activity.closed;
  const status = activity.closed ? "Encerrado" : progress === 100 ? "Concluído" : late ? "Atrasado" : "Em andamento";
  return (
    <li>
      <button type="button" className="sala-row" onClick={() => go("compartilhadas", { id: activity.id })}>
        <span className="sala-row-main">
          <strong>{activity.title}</strong>
          <small>
            {[activity.subjectName, dueText(activity)].filter(Boolean).join(" · ")}
          </small>
        </span>
        <span className="sala-row-people" aria-label={`${activity.members.length} integrantes`}>
          {activity.members.slice(0, 4).map((member) => (
            <Avatar key={member.id} user={member} size={26} />
          ))}
          {activity.members.length > 4 && <small>+{activity.members.length - 4}</small>}
        </span>
        <span className="sala-row-progress">
          <span className="xp-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </span>
          <small>{progress}%</small>
        </span>
        <span className={`sala-status status-${status.toLowerCase().replace(/\s/g, "-")}`}>{status}</span>
      </button>
    </li>
  );
}

export default function Shared() {
  const { call, params, toast, go } = useApp();
  const [state, setState] = useState({ status: "loading", items: [] });
  const [profile, setProfile] = useState(null);
  const [modal, setModal] = useState(params.codigo ? { type: "join" } : null);
  const load = useCallback(async () => {
    try {
      setState({ status: "ready", items: await call("/shared") });
    } catch {
      setState((current) => ({ ...current, status: "error" }));
    }
  }, [call]);
  useEffect(() => {
    load();
    call("/sala/perfil")
      .then((result) => {
        setProfile(result);
        let skipped = false;
        try {
          skipped = sessionStorage.getItem(profileSkipKey) === "1";
        } catch {
          skipped = false;
        }
        if (!result.done && !skipped && !params.codigo && !window.__grimiauTour) setModal((current) => current || { type: "profile" });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, call]);
  const replace = (item) => item && setState((current) => ({ ...current, items: current.items.map((other) => (other.id === item.id ? item : other)) }));
  const active = state.items.filter((item) => !item.closed);
  const closed = state.items.filter((item) => item.closed);
  const current = params.id && state.items.find((item) => item.id === params.id);

  const modals = (
    <>
      {modal?.type === "profile" && (
        <AcademicProfile
          initial={profile}
          onClose={() => {
            try {
              sessionStorage.setItem(profileSkipKey, "1");
            } catch {
              // sem armazenamento: o convite volta na próxima visita
            }
            setModal(null);
          }}
          onSaved={(result) => {
            setProfile(result);
            setModal(null);
          }}
        />
      )}
      {(modal?.type === "new" || modal?.type === "edit") && (
        <WorkForm
          activity={modal.activity}
          profile={profile}
          onClose={() => setModal(null)}
          onSaved={async (result) => {
            toast(modal.type === "edit" ? "Trabalho atualizado. Os integrantes foram avisados." : "Trabalho cadastrado!");
            setModal(null);
            await load();
            if (modal.type === "new" && result?.id) go("compartilhadas", { id: result.id });
          }}
        />
      )}
      {modal?.type === "join" && (
        <JoinForm
          initialCode={params.codigo || ""}
          onClose={() => setModal(null)}
          onJoined={async (activity) => {
            toast(`Você entrou em “${activity.title}”.`);
            setModal(null);
            await load();
            go("compartilhadas", { id: activity.id });
          }}
        />
      )}
    </>
  );

  if (params.id && state.status === "ready") {
    return (
      <div className="page shared-page">
        {current ? (
          <WorkDetail activity={current} onChange={(item) => (item?.id ? replace(item) : load())} onEdit={(item) => setModal({ type: "edit", activity: item })} onLeft={() => { load(); go("compartilhadas"); }} />
        ) : (
          <Empty title="Trabalho não encontrado." action={<button className="btn" onClick={() => go("compartilhadas")}>Voltar para a Sala de Estudos</button>}>
            Ele pode ter sido encerrado ou você não participa mais dele.
          </Empty>
        )}
        {modals}
      </div>
    );
  }

  return (
    <div className="page shared-page">
      <header className="page-head">
        <div>
          <h1>Sala de Estudos 📚</h1>
          <p>Seus trabalhos e projetos acadêmicos.</p>
        </div>
        <div className="page-actions">
          <button className="btn soft" onClick={() => setModal({ type: "join" })}>
            <KeyRound size={16} /> Entrar com código
          </button>
          <button className="btn primary" onClick={() => setModal({ type: "new" })}>
            <Plus size={16} /> Cadastrar novo trabalho
          </button>
        </div>
      </header>
      <button type="button" className="link-btn sala-profile-link" onClick={() => setModal({ type: "profile" })}>
        <Users size={14} /> {profile?.done ? "Meu perfil acadêmico" : "Completar meu perfil acadêmico (nome completo, RA e agência)"}
      </button>
      {state.status === "loading" ? (
        <p className="quiet">Abrindo a Sala de Estudos...</p>
      ) : state.status === "error" ? (
        <p className="quiet">A Sala de Estudos não abriu agora. Tente de novo em instantes.</p>
      ) : state.items.length ? (
        <>
          <ul className="sala-list">
            {active.map((activity) => (
              <WorkRow key={activity.id} activity={activity} />
            ))}
          </ul>
          {closed.length > 0 && (
            <section aria-labelledby="encerrados">
              <h2 className="section-title" id="encerrados">
                Encerrados
              </h2>
              <ul className="sala-list">
                {closed.map((activity) => (
                  <WorkRow key={activity.id} activity={activity} />
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <Empty title="Nenhum trabalho cadastrado." mood="calm" action={<button className="btn primary" onClick={() => setModal({ type: "new" })}><Plus size={16} /> Cadastrar novo trabalho</button>}>
          Seus trabalhos compartilhados aparecerão aqui.
        </Empty>
      )}
      {modals}
    </div>
  );
}
