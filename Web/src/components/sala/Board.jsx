import { useCallback, useEffect, useState } from "react";
import { BellRing, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "../../context.js";
import { formatShort } from "../../lib/dates.js";
import { Avatar, Confirm, FormError, Modal, Segmented, useSubmit } from "../../ui.jsx";

// Quadro de tarefas do trabalho (Pendente, Em andamento, Concluído), sincronizado a cada 15 segundos.
export const columns = ["Pendente", "Em andamento", "Concluído"];
const dueMs = (task) => (task.dueDate ? new Date(`${task.dueDate}T${task.dueTime || "23:59"}:00-03:00`).getTime() : null);

function TaskForm({ activity, task, onClose, onSaved }) {
  const { call } = useApp();
  const [form, setForm] = useState({
    title: task?.title || "",
    description: task?.description || "",
    assigneeId: task?.assignee?.id || "",
    dueDate: task?.dueDate || "",
    dueTime: task?.dueTime || "",
    status: task?.status || "Pendente",
  });
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const { submit, busy, error } = useSubmit(
    () => call(task ? `/shared/${activity.id}/tasks/${task.id}` : `/shared/${activity.id}/tasks`, { method: task ? "PATCH" : "POST", body: { ...form, assigneeId: form.assigneeId || null } }),
    { onDone: onSaved },
  );
  return (
    <Modal title={task ? "Editar tarefa" : "Nova tarefa"} onClose={onClose}>
      <form className="form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label>
          Título
          <input value={form.title} maxLength={160} required onChange={set("title")} placeholder="Ex.: Escrever a introdução" />
        </label>
        <label>
          Descrição
          <textarea value={form.description} rows={3} maxLength={2000} onChange={set("description")} />
        </label>
        <label>
          Responsável
          <select value={form.assigneeId} onChange={set("assigneeId")}>
            <option value="">Sem responsável</option>
            {activity.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
                {member.me ? " (você)" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row">
          <label>
            Prazo
            <input type="date" value={form.dueDate} onChange={set("dueDate")} />
          </label>
          <label>
            Horário
            <input type="time" value={form.dueTime} onChange={set("dueTime")} />
          </label>
        </div>
        <label>
          Status
          <select value={form.status} onChange={set("status")}>
            {columns.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <p className="hint">Se a tarefa passar do prazo sem ser concluída, o responsável perde 300 XP (uma vez por tarefa).</p>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || form.title.trim().length < 2}>
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function TaskCard({ task, activity, onMove, onEdit, onDelete, onRemind }) {
  const { user } = useApp();
  const due = dueMs(task);
  const now = Date.now();
  const late = due && now > due && task.status !== "Concluído";
  const canRemind = task.assignee && task.assignee.id !== user.id && task.status !== "Concluído" && due && now >= due - 86_400_000 && !activity.closed;
  const index = columns.indexOf(task.status);
  return (
    <li className={`task-card ${late ? "is-late" : ""}`}>
      <strong>{task.title}</strong>
      {task.description && <p className="prewrap">{task.description}</p>}
      <div className="task-meta">
        {task.assignee ? (
          <span className="task-assignee">
            <Avatar user={task.assignee} size={22} /> {task.assignee.id === user.id ? "Você" : task.assignee.name}
          </span>
        ) : (
          <span className="quiet">Sem responsável</span>
        )}
        {task.dueDate && (
          <span className={late ? "task-late" : ""}>
            {late ? "Atrasada · " : ""}
            {formatShort(task.dueDate)}
            {task.dueTime ? ` ${task.dueTime}` : ""}
          </span>
        )}
      </div>
      {!activity.closed && (
        <div className="task-actions">
          <button type="button" className="icon-btn" aria-label={`Mover ${task.title} para ${columns[index - 1] || ""}`} disabled={index === 0} onClick={() => onMove(task, columns[index - 1])}>
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Mover ${task.title} para ${columns[index + 1] || ""}`} disabled={index === columns.length - 1} onClick={() => onMove(task, columns[index + 1])}>
            <ChevronRight size={16} />
          </button>
          <span className="spacer" />
          {canRemind && (
            <button type="button" className="btn small soft" onClick={() => onRemind(task)}>
              <BellRing size={14} /> Lembrar
            </button>
          )}
          <button type="button" className="icon-btn" aria-label={`Editar ${task.title}`} onClick={() => onEdit(task)}>
            <Pencil size={15} />
          </button>
          <button type="button" className="icon-btn" aria-label={`Excluir ${task.title}`} onClick={() => onDelete(task)}>
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </li>
  );
}

export default function Board({ activity }) {
  const { call, toast } = useApp();
  const [tasks, setTasks] = useState(null);
  const [view, setView] = useState("Pendente");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const load = useCallback(() => call(`/shared/${activity.id}/tasks`).then(setTasks).catch(() => setTasks((current) => current || [])), [call, activity.id]);
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), 15_000);
    return () => clearInterval(timer);
  }, [load]);
  const move = async (task, status) => {
    try {
      setTasks(await call(`/shared/${activity.id}/tasks/${task.id}`, { method: "PATCH", body: { status } }));
    } catch (failure) {
      toast(failure.message);
    }
  };
  const remind = async (task) => {
    try {
      await call(`/shared/${activity.id}/tasks/${task.id}/lembrete`, { method: "POST" });
      toast(`Lembrete enviado para ${task.assignee.name}.`);
    } catch (failure) {
      toast(failure.message);
    }
  };
  const list = tasks || [];
  const done = list.filter((task) => task.status === "Concluído").length;
  return (
    <section className="sala-board" aria-labelledby="quadro-title">
      <div className="section-head">
        <h2 id="quadro-title" className="section-title">
          Quadro de tarefas {list.length > 0 && <small className="quiet">· {done} de {list.length} concluídas</small>}
        </h2>
        {!activity.closed && (
          <button type="button" className="btn small primary" onClick={() => setEditing("new")}>
            <Plus size={14} /> Nova tarefa
          </button>
        )}
      </div>
      <div className="board-switch">
        <Segmented label="Coluna" value={view} onChange={setView} options={columns} />
      </div>
      {tasks === null ? (
        <p className="quiet">Carregando o quadro...</p>
      ) : (
        <div className="board-columns" data-view={view}>
          {columns.map((column) => {
            const items = list.filter((task) => task.status === column);
            return (
              <section key={column} className={`board-column ${view === column ? "is-current" : ""}`} aria-label={column}>
                <h3>
                  {column} <small>{items.length}</small>
                </h3>
                {items.length ? (
                  <ul>
                    {items.map((task) => (
                      <TaskCard key={task.id} task={task} activity={activity} onMove={move} onEdit={setEditing} onDelete={setDeleting} onRemind={remind} />
                    ))}
                  </ul>
                ) : (
                  <p className="quiet board-empty">Nada aqui.</p>
                )}
              </section>
            );
          })}
        </div>
      )}
      {editing && (
        <TaskForm
          activity={activity}
          task={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(next) => {
            setTasks(next);
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <Confirm
          title="Excluir tarefa?"
          message={`“${deleting.title}” sai do quadro para todo o grupo.`}
          onConfirm={async () => setTasks(await call(`/shared/${activity.id}/tasks/${deleting.id}`, { method: "DELETE" }))}
          onClose={() => setDeleting(null)}
        />
      )}
    </section>
  );
}
