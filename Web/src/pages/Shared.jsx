import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Lock, Pencil, Plus, RefreshCw, UserMinus, Users } from "lucide-react";
import { useApp } from "../context.js";
import { formatFull, todayIso } from "../lib/dates.js";
import { Avatar, Confirm, Empty, FormError, Modal, Segmented, useSubmit } from "../ui.jsx";

const statuses = ["Pendente", "Em andamento", "Concluída"];
const statusClass = { Pendente: "is-pending", "Em andamento": "is-doing", Concluída: "is-done" };
const inviteLink = (code) => `${window.location.origin}/?abrir=compartilhadas&codigo=${code}`;

function ActivityForm({ activity, onClose, onSaved }) {
  const { call, data } = useApp();
  const [fromTask, setFromTask] = useState("");
  const task = data.tasks.find((item) => item.id === fromTask);
  const subjectName = (id) => data.subjects.find((subject) => subject.id === id)?.name || "";
  const initial = activity || (task ? { title: task.title, description: task.notes, subjectName: subjectName(task.subjectId), dueDate: task.dueDate, dueTime: task.dueTime } : {});
  const { submit, busy, error } = useSubmit((body) => (activity ? call(`/shared/${activity.id}`, { method: "PATCH", body }) : call("/shared", { method: "POST", body })), {
    onDone: onSaved,
  });
  const openTasks = data.tasks.filter((item) => !item.done);
  return (
    <Modal title={activity ? "Editar atividade compartilhada" : "Compartilhar uma atividade"} onClose={onClose} wide>
      <form
        key={fromTask}
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        {!activity && openTasks.length > 0 && (
          <label>
            Começar de uma atividade sua (opcional)
            <select value={fromTask} onChange={(event) => setFromTask(event.target.value)}>
              <option value="">Nova atividade</option>
              {openTasks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                  {item.dueDate ? `, até ${formatFull(item.dueDate)}` : ""}
                </option>
              ))}
            </select>
            <small className="hint">Os dados são copiados. A sua atividade pessoal continua como está.</small>
          </label>
        )}
        <label>
          Título
          <input name="title" required maxLength={160} defaultValue={initial.title || ""} placeholder="Ex.: Trabalho de campanha publicitária" />
        </label>
        <div className="form-row">
          <label>
            Matéria
            <input name="subjectName" maxLength={100} list="shared-subjects" defaultValue={initial.subjectName || ""} />
            <datalist id="shared-subjects">
              {data.subjects.map((subject) => (
                <option key={subject.id} value={subject.name} />
              ))}
            </datalist>
          </label>
          <label>
            Prazo
            <input type="date" name="dueDate" defaultValue={initial.dueDate || ""} />
          </label>
          <label>
            Horário
            <input type="time" name="dueTime" defaultValue={initial.dueTime || ""} />
          </label>
        </div>
        <label>
          Descrição
          <textarea name="description" rows={4} maxLength={4000} defaultValue={initial.description || ""} placeholder="O que precisa ser feito, divisão das partes, combinados." />
        </label>
        <label>
          Materiais relacionados
          <textarea name="materials" rows={2} maxLength={2000} defaultValue={initial.materials || ""} placeholder="Links do Drive, páginas do livro, slides." />
        </label>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Salvando..." : activity ? "Salvar para todos" : "Criar e gerar convite"}
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
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(String(new FormData(event.currentTarget).get("code") || ""));
        }}
      >
        <label>
          Código de convite
          <input name="code" required maxLength={12} defaultValue={initialCode} autoCapitalize="characters" autoComplete="off" placeholder="Ex.: K7M2QX9A" className="code-input" />
          <small className="hint">Peça o código a quem criou a atividade. Seus colegas veem só seu nome público, sua foto e seu status.</small>
        </label>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Entrando..." : "Entrar na atividade"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ActivityCard({ activity, highlighted, onChange, onEdit }) {
  const { call, toast } = useApp();
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const me = activity.members.find((member) => member.me);
  const done = activity.members.filter((member) => member.status === "Concluída").length;
  const late = activity.dueDate && activity.dueDate < todayIso() && me?.status !== "Concluída";
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
  return (
    <li className={`shared-card ${activity.closed ? "is-closed" : ""} ${highlighted ? "is-highlighted" : ""}`} id={`compartilhada-${activity.id}`}>
      <header>
        <div>
          <strong>{activity.title}</strong>
          <small>
            {[activity.subjectName, activity.dueDate && `até ${formatFull(activity.dueDate)}${activity.dueTime ? ` às ${activity.dueTime}` : ""}`].filter(Boolean).join(" · ") || "Sem prazo definido"}
            {late ? " · prazo passou" : ""}
          </small>
        </div>
        {activity.closed ? (
          <span className="badge">
            <Lock size={12} /> Encerrada
          </span>
        ) : (
          activity.owner && (
            <button className="icon-btn" aria-label={`Editar ${activity.title}`} onClick={() => onEdit(activity)}>
              <Pencil size={15} />
            </button>
          )
        )}
      </header>
      {activity.description && <p className="prewrap">{activity.description}</p>}
      {activity.materials && (
        <p className="prewrap shared-materials">
          <strong>Materiais:</strong> {activity.materials}
        </p>
      )}
      {me && !activity.closed && (
        <div className="shared-mine">
          <span>Minha parte</span>
          <Segmented label="Meu status" value={me.status} onChange={(status) => !busy && act(() => call(`/shared/${activity.id}/status`, { method: "PUT", body: { status } }), status === "Concluída" ? "Parte concluída. Os colegas foram avisados." : "")} options={statuses} />
        </div>
      )}
      <div className="shared-progress" aria-label={`${done} de ${activity.members.length} concluíram`}>
        <span className="xp-track" aria-hidden="true">
          <span style={{ width: `${(done / activity.members.length) * 100}%` }} />
        </span>
        <small>
          {done} de {activity.members.length} concluíram
        </small>
      </div>
      <ul className="shared-members">
        {activity.members.map((member) => (
          <li key={member.id}>
            <Avatar user={{ id: member.id, name: member.name, avatarVersion: member.avatarVersion }} size={28} />
            <span>
              {member.name}
              {member.owner ? " (criou)" : ""}
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
      {activity.owner && !activity.closed && (
        <div className="shared-invite">
          <KeyRound size={15} aria-hidden="true" />
          <span>
            Código de convite: <code>{activity.inviteCode}</code>
          </span>
          <button
            className="btn ghost small"
            onClick={() =>
              navigator.clipboard
                ?.writeText(`Entre na atividade "${activity.title}" na Grimiau: ${inviteLink(activity.inviteCode)} (código ${activity.inviteCode})`)
                .then(() => toast("Convite copiado. Mande para seus colegas."))
                .catch(() => toast(`Código: ${activity.inviteCode}`))
            }
          >
            <Copy size={14} /> Copiar convite
          </button>
          <button className="btn ghost small" disabled={busy} onClick={() => act(() => call(`/shared/${activity.id}/code`, { method: "POST" }), "Código trocado. O anterior não funciona mais.")}>
            <RefreshCw size={14} /> Trocar código
          </button>
        </div>
      )}
      <footer>
        {activity.owner ? (
          <button className="link-btn" disabled={busy} onClick={() => (activity.closed ? act(() => call(`/shared/${activity.id}/close`, { method: "POST", body: { closed: false } }), "Compartilhamento reaberto.") : setConfirm({ type: "close" }))}>
            {activity.closed ? "Reabrir compartilhamento" : "Encerrar compartilhamento"}
          </button>
        ) : (
          <button className="link-btn" onClick={() => setConfirm({ type: "leave" })}>
            Sair da atividade
          </button>
        )}
      </footer>
      {confirm?.type === "close" && (
        <Confirm
          title="Encerrar compartilhamento"
          message="Ninguém mais entra com o código e os status ficam congelados. A atividade continua visível para consulta, e nada é apagado. Dá para reabrir depois."
          confirmLabel="Encerrar"
          onClose={() => setConfirm(null)}
          onConfirm={() => act(() => call(`/shared/${activity.id}/close`, { method: "POST", body: { closed: true } }), "Compartilhamento encerrado.")}
        />
      )}
      {confirm?.type === "remove" && (
        <Confirm
          title="Remover participante"
          message={`${confirm.member.name} deixa de ver esta atividade. As atividades pessoais dele(a) não mudam.`}
          confirmLabel="Remover"
          onClose={() => setConfirm(null)}
          onConfirm={() => act(() => call(`/shared/${activity.id}/members/${confirm.member.id}`, { method: "DELETE" }), "Participante removido.")}
        />
      )}
      {confirm?.type === "leave" && (
        <Confirm
          title="Sair da atividade"
          message="Você deixa de ver esta atividade. Para voltar, peça para quem criou."
          confirmLabel="Sair"
          onClose={() => setConfirm(null)}
          onConfirm={() => act(() => call(`/shared/${activity.id}/members/${me.id}`, { method: "DELETE" }), "Você saiu da atividade.")}
        />
      )}
    </li>
  );
}

export default function Shared() {
  const { call, params, toast } = useApp();
  const [state, setState] = useState({ status: "loading", items: [] });
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
  }, [load]);
  useEffect(() => {
    if (params.id && state.status === "ready") document.getElementById(`compartilhada-${params.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [params.id, state.status]);
  const active = state.items.filter((item) => !item.closed);
  const closed = state.items.filter((item) => item.closed);
  const card = (activity) => <ActivityCard key={activity.id} activity={activity} highlighted={params.id === activity.id} onChange={load} onEdit={(item) => setModal({ type: "edit", activity: item })} />;

  return (
    <div className="page shared-page">
      <header className="page-head">
        <div>
          <h1>Atividades compartilhadas</h1>
          <p>A mesma atividade com seus colegas, cada um com o próprio status.</p>
        </div>
        <div className="page-actions">
          <button className="btn soft" onClick={() => setModal({ type: "join" })}>
            <KeyRound size={16} /> Entrar com código
          </button>
          <button className="btn primary" onClick={() => setModal({ type: "new" })}>
            <Plus size={16} /> Compartilhar atividade
          </button>
        </div>
      </header>
      {state.status === "loading" ? (
        <p className="quiet">Carregando atividades...</p>
      ) : state.status === "error" ? (
        <p className="quiet">As atividades não abriram agora. Tente de novo em instantes.</p>
      ) : state.items.length ? (
        <>
          <ul className="shared-list">{active.map(card)}</ul>
          {closed.length > 0 && (
            <section aria-labelledby="encerradas">
              <h2 className="section-title" id="encerradas">
                Encerradas
              </h2>
              <ul className="shared-list">{closed.map(card)}</ul>
            </section>
          )}
        </>
      ) : (
        <Empty title="Nenhuma atividade compartilhada" mood="calm" action={<button className="btn primary" onClick={() => setModal({ type: "new" })}><Users size={16} /> Compartilhar a primeira</button>}>
          Crie uma atividade e mande o código para a turma. Quando alguém concluir a parte dele, você recebe um aviso no sino.
        </Empty>
      )}
      <p className="footnote">Concluir a sua parte não marca a atividade como feita para os outros. Encerrar o compartilhamento não apaga nada.</p>
      {(modal?.type === "new" || modal?.type === "edit") && (
        <ActivityForm
          activity={modal.activity}
          onClose={() => setModal(null)}
          onSaved={async () => {
            toast(modal.type === "edit" ? "Atividade atualizada. Os participantes foram avisados." : "Atividade criada. Copie o convite para seus colegas.");
            setModal(null);
            await load();
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
          }}
        />
      )}
    </div>
  );
}
