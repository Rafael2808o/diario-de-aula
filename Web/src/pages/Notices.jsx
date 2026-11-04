import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, Check, Paperclip, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { Avatar, Confirm, Empty, FormError, Modal, useSubmit } from "../ui.jsx";
import { apiFileUrl, authorUser, filePayload, useMarkSeen, useRole, when } from "../lib/social.js";
import { formatLong } from "../lib/dates.js";

// Comunicados Gerais: só administração, moderação e publicadores autorizados publicam.
// Todo mundo lê e marca como lido. Os importantes aparecem primeiro e avisam todo mundo.
export const noticeCategories = ["Provas", "Trabalhos", "Eventos", "Avisos gerais", "Alterações acadêmicas", "Informações importantes"];
const maxFileBytes = 3 * 1024 * 1024;

function NoticeForm({ notice, onClose, onSaved }) {
  const { call } = useApp();
  const [form, setForm] = useState({ title: notice?.title || "", body: notice?.body || "", category: notice?.category || "Avisos gerais", eventDate: notice?.eventDate || "", important: Boolean(notice?.important) });
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.type === "checkbox" ? event.target.checked : event.target.value });
  const { submit, busy, error } = useSubmit(
    async () => {
      const body = { ...form };
      if (!notice && file) body.file = await filePayload(file);
      return call(notice ? `/comunicados/${notice.id}` : "/comunicados", { method: notice ? "PATCH" : "POST", body });
    },
    { success: notice ? "Comunicado atualizado." : "Comunicado publicado.", onDone: onSaved }
  );
  return (
    <Modal title={notice ? "Editar comunicado" : "Novo comunicado"} onClose={onClose}>
      <form className="form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <label>
          Título
          <input value={form.title} maxLength={160} required onChange={set("title")} />
        </label>
        <label>
          Categoria
          <select value={form.category} onChange={set("category")}>
            {noticeCategories.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Texto
          <textarea value={form.body} rows={5} maxLength={4000} onChange={set("body")} />
        </label>
        <label>
          Data do evento (opcional)
          <input type="date" value={form.eventDate} onChange={set("eventDate")} />
        </label>
        <label className="check">
          <input type="checkbox" checked={form.important} onChange={set("important")} /> Marcar como importante (avisa todo mundo)
        </label>
        {!notice && (
          <label>
            Anexo (opcional, PDF ou imagem até 3 MB)
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const chosen = event.target.files?.[0] || null;
                setFileError(chosen && chosen.size > maxFileBytes ? "O anexo precisa ter até 3 MB." : "");
                setFile(chosen && chosen.size <= maxFileBytes ? chosen : null);
              }}
            />
          </label>
        )}
        <FormError>{fileError || error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || form.title.trim().length < 3}>
            {busy ? "Salvando..." : notice ? "Salvar" : "Publicar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NoticeCard({ notice: raw, canManage, onChange, onRemove, onEdit }) {
  // Quem publicou já leu o próprio comunicado.
  const notice = raw.mine ? { ...raw, read: true } : raw;
  const { call, toast } = useApp();
  const [deleting, setDeleting] = useState(false);
  const markRead = async () => {
    await call(`/comunicados/${notice.id}/lido`, { method: "POST" }).catch(() => {});
    onChange({ ...notice, read: true });
  };
  const archive = async () => {
    try {
      await call(`/comunicados/${notice.id}`, { method: "PATCH", body: { archived: !notice.archived } });
      toast(notice.archived ? "Comunicado de volta à lista." : "Comunicado arquivado.");
      onRemove(notice.id);
    } catch (failure) {
      toast(failure.message);
    }
  };
  return (
    <article className={`notice-card ${notice.important ? "is-important" : ""} ${notice.read ? "is-read" : ""}`}>
      <header className="notice-head">
        <span className="notice-category">{notice.category}</span>
        {notice.important && (
          <span className="notice-flag">
            <Star size={13} aria-hidden="true" /> Importante
          </span>
        )}
        {!notice.read && <span className="news-dot" aria-label="não lido" />}
      </header>
      <h3>{notice.title}</h3>
      {notice.body && <p className="prewrap">{notice.body}</p>}
      {notice.eventDate && (
        <p className="notice-event">
          <CalendarDays size={14} aria-hidden="true" /> {formatLong(notice.eventDate)}
        </p>
      )}
      {notice.file && (
        <a className="notice-file" href={apiFileUrl(`/comunicados/${notice.id}/arquivo`)} target="_blank" rel="noopener noreferrer">
          <Paperclip size={14} aria-hidden="true" /> {notice.file.name}
        </a>
      )}
      <footer className="notice-foot">
        <span className="notice-author">
          <Avatar user={authorUser(notice.author)} size={24} /> {notice.author?.name || "Um bruxinho"} · {when(notice.createdAt)}
        </span>
        <span className="notice-actions">
          {!notice.read && !notice.archived && (
            <button type="button" className="btn small" onClick={markRead}>
              <Check size={14} /> Marcar como lido
            </button>
          )}
          {canManage && (
            <>
              {!notice.archived && (
                <button type="button" className="icon-btn" aria-label="Editar comunicado" onClick={() => onEdit(notice)}>
                  <Pencil size={15} />
                </button>
              )}
              <button type="button" className="icon-btn" aria-label={notice.archived ? "Desarquivar comunicado" : "Arquivar comunicado"} onClick={archive}>
                {notice.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
              </button>
              <button type="button" className="icon-btn" aria-label="Excluir comunicado" onClick={() => setDeleting(true)}>
                <Trash2 size={15} />
              </button>
            </>
          )}
        </span>
      </footer>
      {deleting && (
        <Confirm
          title="Excluir comunicado?"
          message="O comunicado sai da lista de todo mundo."
          onConfirm={async () => {
            await call(`/comunicados/${notice.id}`, { method: "DELETE" });
            toast("Comunicado excluído.");
            onRemove(notice.id);
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </article>
  );
}

export default function Notices() {
  const { call, go, user } = useApp();
  const role = useRole();
  const canPublish = ["admin", "moderador", "publicador"].includes(role);
  const [archived, setArchived] = useState(false);
  const [category, setCategory] = useState("");
  const [state, setState] = useState({ status: "loading", items: [], error: "" });
  const [editing, setEditing] = useState(null);
  useMarkSeen("comunicados");

  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, status: "loading" }));
    call(`/comunicados${archived ? "?arquivados=1" : ""}`)
      .then((items) => alive && setState({ status: "ready", items, error: "" }))
      .catch((failure) => alive && setState({ status: "error", items: [], error: failure.message }));
    return () => {
      alive = false;
    };
  }, [call, archived]);

  const replace = (item) => setState((current) => ({ ...current, items: current.items.map((other) => (other.id === item.id ? item : other)) }));
  const remove = (id) => setState((current) => ({ ...current, items: current.items.filter((other) => other.id !== id) }));
  const manageable = (notice) => role === "admin" || role === "moderador" || (role === "publicador" && notice.author?.id === user.id);
  const visible = state.items.filter((item) => !category || item.category === category);
  const unread = state.items.filter((item) => !item.read && !item.mine).length;

  return (
    <div className="page notices-page">
      <button className="link-btn back" onClick={() => go("comunidade")}>
        <ArrowLeft size={15} /> Comunidade
      </button>
      <header className="page-head">
        <div>
          <h1>Comunicados Gerais</h1>
          <p>Avisos e informações importantes{!archived && unread ? ` · ${unread} ${unread === 1 ? "não lido" : "não lidos"}` : ""}.</p>
        </div>
        {canPublish && (
          <div className="page-actions">
            <button className="btn primary" onClick={() => setEditing("new")}>
              <Plus size={16} /> Novo comunicado
            </button>
          </div>
        )}
      </header>
      <div className="chip-row" role="group" aria-label="Filtrar por categoria">
        <button type="button" className={`chip ${!category ? "active" : ""}`} aria-pressed={!category} onClick={() => setCategory("")}>
          Todos
        </button>
        {noticeCategories.map((item) => (
          <button key={item} type="button" className={`chip ${category === item ? "active" : ""}`} aria-pressed={category === item} onClick={() => setCategory(category === item ? "" : item)}>
            {item}
          </button>
        ))}
        {canPublish && (
          <button type="button" className={`chip ${archived ? "active" : ""}`} aria-pressed={archived} onClick={() => setArchived(!archived)}>
            <Archive size={13} /> Arquivados
          </button>
        )}
      </div>
      {state.status === "loading" ? (
        <p className="quiet">Carregando os comunicados...</p>
      ) : state.status === "error" ? (
        <Empty title="Não foi possível abrir os comunicados.">{state.error}</Empty>
      ) : visible.length ? (
        <div className="notice-list">
          {visible.map((notice) => (
            <NoticeCard key={notice.id} notice={notice} canManage={manageable(notice)} onChange={replace} onRemove={remove} onEdit={setEditing} />
          ))}
        </div>
      ) : (
        <Empty title={archived ? "Nenhum comunicado arquivado." : "Nenhum comunicado por enquanto."}>{archived ? "" : "Quando houver um aviso, ele aparece aqui."}</Empty>
      )}
      {editing && (
        <NoticeForm
          notice={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(item) => {
            setEditing(null);
            if (!item) return;
            if (editing === "new") setState((current) => ({ ...current, items: [item, ...current.items] }));
            else replace(item);
          }}
        />
      )}
    </div>
  );
}
