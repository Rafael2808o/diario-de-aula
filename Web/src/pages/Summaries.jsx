import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookmarkPlus, Check, FileText, MessageCircle, Plus, Search, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { Avatar, Confirm, Empty, FormError, Modal, useSubmit } from "../ui.jsx";
import { apiFileUrl, authorUser, filePayload, useLiveList, useMarkSeen, when } from "../lib/social.js";

// Resumos Compartilhados: PDF ou imagem de até 3 MB, com disciplina e descrição.
// XP: +50 ao compartilhar (uma vez por arquivo, até 3 por dia), +20 ao reagir e +40 ao salvar
// um resumo de outra pessoa (uma vez por resumo). As regras ficam na API.
const maxBytes = 3 * 1024 * 1024;
const accepted = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const sizeText = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

function ShareForm({ onClose, onShared }) {
  const { call, data } = useApp();
  const [form, setForm] = useState({ title: "", subject: data.subjects[0]?.name || "", description: "" });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [fileError, setFileError] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  const pick = (event) => {
    const chosen = event.target.files?.[0];
    if (!chosen) return;
    if (!accepted.includes(chosen.type)) return setFileError("Envie um PDF ou uma imagem (JPG, PNG ou WebP).");
    if (chosen.size > maxBytes) return setFileError("O arquivo precisa ter até 3 MB.");
    setFileError("");
    setFile(chosen);
    setPreview(URL.createObjectURL(chosen));
    if (!form.title) setForm((current) => ({ ...current, title: chosen.name.replace(/\.[^.]+$/, "").slice(0, 160) }));
  };
  const { submit, busy, error } = useSubmit(async () => call("/resumos", { method: "POST", body: { ...form, file: await filePayload(file) } }), { onDone: onShared });
  return (
    <Modal title="Compartilhar resumo" onClose={onClose} wide>
      <form className="form summary-form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="summary-form-fields">
          <label>
            Arquivo (PDF ou imagem até 3 MB)
            <input type="file" accept={accepted.join(",")} onChange={pick} required />
          </label>
          <label>
            Nome do resumo
            <input value={form.title} maxLength={160} required onChange={set("title")} />
          </label>
          <label>
            Disciplina
            <input value={form.subject} maxLength={100} required list="summary-subjects" onChange={set("subject")} />
            <datalist id="summary-subjects">
              {data.subjects.map((subject) => (
                <option key={subject.id} value={subject.name} />
              ))}
            </datalist>
          </label>
          <label>
            Descrição (opcional)
            <textarea value={form.description} rows={3} maxLength={1500} onChange={set("description")} placeholder="O que o resumo cobre?" />
          </label>
          <p className="hint">Toda a Comunidade vê. Compartilhe só material seu ou que você pode repassar.</p>
        </div>
        <div className="summary-preview" aria-label="Pré-visualização do arquivo">
          {!file ? (
            <p className="quiet">A pré-visualização aparece aqui.</p>
          ) : file.type === "application/pdf" ? (
            <object data={preview} type="application/pdf" aria-label={file.name}>
              <p className="quiet">
                <FileText size={18} /> {file.name} · {sizeText(file.size)}
              </p>
            </object>
          ) : (
            <img src={preview} alt={`Pré-visualização de ${file.name}`} />
          )}
        </div>
        <FormError>{fileError || error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !file || form.title.trim().length < 3 || !form.subject.trim()}>
            {busy ? "Enviando..." : "Compartilhar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ReactionBar({ summary, onChange }) {
  const { call, toast } = useApp();
  const react = async (kind) => {
    try {
      const item = await call(`/resumos/${summary.id}/reactions`, { method: "POST", body: { kind } });
      if (item.xpAwarded) toast(`+${item.xpAwarded} XP por reagir a um resumo da Comunidade.`);
      onChange(item);
    } catch (failure) {
      toast(failure.message);
    }
  };
  return (
    <div className="reaction-row" role="group" aria-label="Reagir ao resumo">
      {summary.reactions.map((item) => (
        <button key={item.kind} type="button" className={`reaction ${item.reacted ? "active" : ""}`} aria-pressed={item.reacted} onClick={() => react(item.kind)}>
          {item.label} {item.count > 0 && <small>{item.count}</small>}
        </button>
      ))}
    </div>
  );
}

function SaveButton({ summary, onSaved }) {
  const { call, create, data, toast } = useApp();
  const [choosing, setChoosing] = useState(false);
  const [subjectId, setSubjectId] = useState(() => data.subjects.find((item) => item.name.toLowerCase() === summary.subject.toLowerCase())?.id || data.subjects[0]?.id || "");
  const { submit, busy, error } = useSubmit(async () => {
    const subject = data.subjects.find((item) => item.id === subjectId);
    const result = await call(`/resumos/${summary.id}/salvar`, { method: "POST" });
    await create("materials", {
      title: summary.title,
      type: result.mime === "application/pdf" ? "PDF" : "Foto",
      subjectId: subject?.id || null,
      subject: subject?.name || summary.subject,
      url: apiFileUrl(`/resumos/${summary.id}/arquivo`),
      notes: `Resumo compartilhado por ${result.author} na Comunidade.`,
    });
    toast(result.xpAwarded ? `Salvo no seu Grimório! +${result.xpAwarded} XP.` : "Salvo no seu Grimório!");
    return result;
  }, { onDone: () => { setChoosing(false); onSaved(); } });
  if (summary.saved)
    return (
      <span className="summary-saved">
        <Check size={14} /> No seu Grimório
      </span>
    );
  return (
    <>
      <button type="button" className="btn small" onClick={() => setChoosing(true)}>
        <BookmarkPlus size={14} /> Salvar no meu Grimório
      </button>
      {choosing && (
        <Modal title="Salvar no meu Grimório" onClose={() => setChoosing(false)}>
          <form className="form" onSubmit={(event) => { event.preventDefault(); submit(); }}>
            <label>
              Em qual disciplina?
              <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                {data.subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
                <option value="">Sem disciplina</option>
              </select>
            </label>
            <p className="hint">O resumo vira um material com o crédito de quem compartilhou.</p>
            <FormError>{error}</FormError>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setChoosing(false)}>
                Cancelar
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

function SummaryDetail({ id }) {
  const { call, go, toast } = useApp();
  const [state, setState] = useState({ status: "loading", item: null, error: "" });
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    let alive = true;
    call(`/resumos/${id}`)
      .then((item) => alive && setState({ status: "ready", item, error: "" }))
      .catch((failure) => alive && setState({ status: "error", item: null, error: failure.message }));
    return () => {
      alive = false;
    };
  }, [call, id]);
  const item = state.item;
  const update = (next) => setState((current) => ({ ...current, item: { ...current.item, ...next } }));
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      update(await call(`/resumos/${id}/comments`, { method: "POST", body: { body: comment } }));
      setComment("");
    } catch (failure) {
      toast(failure.message);
    } finally {
      setBusy(false);
    }
  };
  if (state.status === "loading") return <p className="quiet">Abrindo o resumo...</p>;
  if (state.status === "error") return <Empty title="Não foi possível abrir este resumo.">{state.error}</Empty>;
  const fileUrl = apiFileUrl(`/resumos/${id}/arquivo`);
  return (
    <article className="summary-detail">
      <header className="page-head">
        <div>
          <span className="summary-subject">{item.subject}</span>
          <h1>{item.title}</h1>
          <p className="summary-author">
            <Avatar user={authorUser(item.author)} size={24} /> {item.author?.name || "Um bruxinho"} · {when(item.createdAt)}
          </p>
        </div>
      </header>
      {item.description && <p className="prewrap summary-description">{item.description}</p>}
      <div className="summary-file">
        {item.file.mime === "application/pdf" ? (
          <a className="btn" href={fileUrl} target="_blank" rel="noopener noreferrer">
            <FileText size={16} /> Abrir PDF ({sizeText(item.file.size)})
          </a>
        ) : (
          <a href={fileUrl} target="_blank" rel="noopener noreferrer">
            <img src={fileUrl} alt={`Resumo: ${item.title}`} loading="lazy" />
          </a>
        )}
        {!item.mine && <SaveButton summary={item} onSaved={() => update({ saved: true })} />}
        {item.mine && (
          <button type="button" className="btn small ghost" onClick={() => setDeleting(true)}>
            <Trash2 size={14} /> Excluir meu resumo
          </button>
        )}
      </div>
      <ReactionBar summary={item} onChange={update} />
      <section className="summary-comments" aria-labelledby="summary-comments-title">
        <h2 id="summary-comments-title">Comentários</h2>
        {item.comments.length ? (
          <ul>
            {item.comments.map((entry) => (
              <li key={entry.id} className="tarot-reply">
                <Avatar user={authorUser(entry.author)} size={26} />
                <p>
                  <strong>{entry.author?.name}</strong> <small>{when(entry.createdAt)}</small>
                  <br />
                  <span className="prewrap">{entry.body}</span>
                </p>
                {entry.mine && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Apagar meu comentário"
                    onClick={async () => {
                      await call(`/resumos/comments/${entry.id}`, { method: "DELETE" });
                      update({ comments: item.comments.filter((other) => other.id !== entry.id) });
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="quiet">Ninguém comentou ainda.</p>
        )}
        <form className="form tarot-reply-form" onSubmit={send}>
          <input value={comment} maxLength={1500} onChange={(event) => setComment(event.target.value)} placeholder="Escreva um comentário" aria-label="Comentário" />
          <button className="btn small primary" disabled={busy || !comment.trim()}>
            Enviar
          </button>
        </form>
      </section>
      {deleting && (
        <Confirm
          title="Excluir resumo?"
          message="O resumo sai da Comunidade. Quem já salvou perde o acesso ao arquivo."
          onConfirm={async () => {
            await call(`/resumos/${id}`, { method: "DELETE" });
            toast("Resumo excluído.");
            go("resumos");
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </article>
  );
}

export default function Summaries() {
  const { go, params, toast } = useApp();
  const summaries = useLiveList("/resumos", { every: 45_000 });
  const [sharing, setSharing] = useState(false);
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  useMarkSeen("resumos");
  const subjects = useMemo(() => [...new Set(summaries.items.map((item) => item.subject))].sort((a, b) => a.localeCompare(b, "pt-BR")), [summaries.items]);
  const needle = query.trim().toLowerCase();
  const visible = summaries.items.filter((item) => (!subject || item.subject === subject) && (!needle || `${item.title} ${item.subject} ${item.description}`.toLowerCase().includes(needle)));

  if (params.id)
    return (
      <div className="page summaries-page">
        <button className="link-btn back" onClick={() => go("resumos")}>
          <ArrowLeft size={15} /> Resumos Compartilhados
        </button>
        <SummaryDetail id={params.id} />
      </div>
    );

  return (
    <div className="page summaries-page">
      <button className="link-btn back" onClick={() => go("comunidade")}>
        <ArrowLeft size={15} /> Comunidade
      </button>
      <header className="page-head">
        <div>
          <h1>Resumos Compartilhados</h1>
          <p>Compartilhe conhecimento e encontre materiais de outros estudantes.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setSharing(true)}>
            <Plus size={16} /> Compartilhar resumo
          </button>
        </div>
      </header>
      <div className="toolbar">
        <label className="search-field">
          <Search size={15} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar resumo ou disciplina" aria-label="Buscar resumo" maxLength={80} />
        </label>
        {subjects.length > 1 && (
          <select value={subject} onChange={(event) => setSubject(event.target.value)} aria-label="Filtrar por disciplina">
            <option value="">Todas as disciplinas</option>
            {subjects.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        )}
      </div>
      {summaries.status === "loading" ? (
        <p className="quiet">Carregando os resumos...</p>
      ) : summaries.status === "error" ? (
        <Empty title="Não foi possível abrir os resumos.">{summaries.error}</Empty>
      ) : visible.length ? (
        <ul className="summary-list">
          {visible.map((item) => (
            <li key={item.id}>
              <button type="button" className="summary-row" onClick={() => go("resumos", { id: item.id })}>
                <span className="summary-row-icon" aria-hidden="true">
                  <FileText size={20} strokeWidth={1.6} />
                </span>
                <span className="summary-row-text">
                  <strong>{item.title}</strong>
                  <small>
                    {item.subject} · {item.author?.name || "Um bruxinho"} · {when(item.createdAt)}
                  </small>
                </span>
                <span className="summary-row-meta">
                  {item.reactions.reduce((total, reaction) => total + reaction.count, 0) > 0 && <small>💜 {item.reactions.reduce((total, reaction) => total + reaction.count, 0)}</small>}
                  {item.commentCount > 0 && (
                    <small>
                      <MessageCircle size={12} aria-hidden="true" /> {item.commentCount}
                    </small>
                  )}
                  {item.saved && <Check size={14} aria-label="salvo no seu Grimório" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={summaries.items.length ? "Nenhum resumo com esse filtro." : "Ainda não há resumos compartilhados."} action={!summaries.items.length && <button className="btn primary" onClick={() => setSharing(true)}>Compartilhar o primeiro</button>}>
          {summaries.items.length ? "" : "Cada resumo novo vale +50 XP (até 3 por dia)."}
        </Empty>
      )}
      {sharing && (
        <ShareForm
          onClose={() => setSharing(false)}
          onShared={(item) => {
            setSharing(false);
            summaries.add(item);
            toast(item.xpAwarded ? `Resumo compartilhado! +${item.xpAwarded} XP.` : "Resumo compartilhado!");
          }}
        />
      )}
    </div>
  );
}
