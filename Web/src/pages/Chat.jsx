import { useState } from "react";
import { ArrowLeft, Hourglass, MessageCircle, Plus, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { Avatar, Confirm, Empty, FormError, Modal, useSubmit } from "../ui.jsx";
import { authorUser, expiresIn, useLiveList, useMarkSeen, when } from "../lib/social.js";

// Bate-papo: cartinhas inspiradas em cartas de tarô. Cada uma fica 48 horas e depois some do sistema
// (com reações e respostas). A lista se atualiza sozinha a cada 20 segundos.
const numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"];

function LetterCard({ letter, index, preview = false, onChange, onRemove }) {
  const { call, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const react = async (emoji) => {
    try {
      onChange(await call(`/batepapo/${letter.id}/reactions`, { method: "POST", body: { emoji } }));
    } catch (failure) {
      toast(failure.message);
    }
  };
  const send = async (event) => {
    event.preventDefault();
    if (!reply.trim()) return;
    setBusy(true);
    try {
      onChange(await call(`/batepapo/${letter.id}/comments`, { method: "POST", body: { body: reply } }));
      setReply("");
    } catch (failure) {
      toast(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <article className="tarot-letter">
      <header className="tarot-letter-head">
        <span className="tarot-numeral" aria-hidden="true">{numerals[index % numerals.length]}</span>
        <Avatar user={authorUser(letter.author)} size={34} />
        <span className="tarot-author">
          <strong>{letter.author?.name || "Você"}</strong>
          <small>{preview ? "agora" : `${when(letter.createdAt)} · ${new Date(letter.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}</small>
        </span>
      </header>
      {letter.title && <h3 className="tarot-title">{letter.title}</h3>}
      <p className="tarot-body prewrap">{letter.body || "Sua mensagem aparece aqui."}</p>
      {!preview && (
        <>
          <div className="reaction-row" role="group" aria-label="Reagir à cartinha">
            {letter.reactions.map((item) => (
              <button key={item.emoji} type="button" className={`reaction ${item.reacted ? "active" : ""}`} aria-pressed={item.reacted} aria-label={`${item.emoji} ${item.count}`} onClick={() => react(item.emoji)}>
                <span aria-hidden="true">{item.emoji}</span> {item.count > 0 && <small>{item.count}</small>}
              </button>
            ))}
          </div>
          <footer className="tarot-foot">
            <button type="button" className="link-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
              <MessageCircle size={14} /> {letter.comments.length ? `${letter.comments.length} ${letter.comments.length === 1 ? "resposta" : "respostas"}` : "Responder"}
            </button>
            <span className="tarot-expires">
              <Hourglass size={13} aria-hidden="true" /> {expiresIn(letter.expiresAt)}
            </span>
            {letter.mine && (
              <button type="button" className="icon-btn" aria-label="Apagar minha cartinha" onClick={() => setDeleting(true)}>
                <Trash2 size={15} />
              </button>
            )}
          </footer>
          {open && (
            <div className="tarot-replies">
              {letter.comments.map((comment) => (
                <div key={comment.id} className="tarot-reply">
                  <Avatar user={authorUser(comment.author)} size={26} />
                  <p>
                    <strong>{comment.author.name}</strong> <small>{when(comment.createdAt)}</small>
                    <br />
                    <span className="prewrap">{comment.body}</span>
                  </p>
                  {comment.mine && (
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Apagar minha resposta"
                      onClick={async () => {
                        await call(`/batepapo/comments/${comment.id}`, { method: "DELETE" });
                        onChange({ ...letter, comments: letter.comments.filter((item) => item.id !== comment.id) });
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
              <form className="form tarot-reply-form" onSubmit={send}>
                <input value={reply} maxLength={1000} onChange={(event) => setReply(event.target.value)} placeholder="Escreva uma resposta" aria-label="Resposta" />
                <button className="btn small primary" disabled={busy || !reply.trim()}>
                  Enviar
                </button>
              </form>
            </div>
          )}
        </>
      )}
      {deleting && (
        <Confirm
          title="Apagar cartinha?"
          message="A cartinha e as respostas saem do Bate-papo para todo mundo."
          confirmLabel="Apagar"
          onConfirm={async () => {
            await call(`/batepapo/${letter.id}`, { method: "DELETE" });
            toast("Cartinha apagada.");
            onRemove(letter.id);
          }}
          onClose={() => setDeleting(false)}
        />
      )}
    </article>
  );
}

function LetterEditor({ onClose, onCreated }) {
  const { call, user } = useApp();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const { submit, busy, error } = useSubmit(() => call("/batepapo", { method: "POST", body: { title, body } }), { success: "Cartinha publicada! Ela fica no Bate-papo por 48 horas.", onDone: onCreated });
  return (
    <Modal title="Escrever uma cartinha" onClose={onClose} wide>
      <form className="form letter-editor" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <div className="letter-editor-fields">
          <label>
            Título (opcional)
            <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Ex.: Alguém para estudar hoje?" />
          </label>
          <label>
            Mensagem
            <textarea value={body} rows={6} maxLength={2000} required onChange={(event) => setBody(event.target.value)} placeholder="Escreva sua cartinha para os migles" />
          </label>
          <p className="hint">Todo mundo da Comunidade vê. A cartinha some sozinha depois de 48 horas.</p>
        </div>
        <div className="letter-editor-preview" aria-label="Pré-visualização da carta">
          <small className="hint">Pré-visualização</small>
          <LetterCard preview index={0} letter={{ title, body, author: { id: user.id, name: "Você", avatarVersion: user.avatarVersion } }} />
        </div>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || body.trim().length < 2}>
            {busy ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function Chat() {
  const { go } = useApp();
  const letters = useLiveList("/batepapo");
  const [writing, setWriting] = useState(false);
  useMarkSeen("batepapo");
  return (
    <div className="page chat-page">
      <button className="link-btn back" onClick={() => go("comunidade")}>
        <ArrowLeft size={15} /> Comunidade
      </button>
      <header className="page-head">
        <div>
          <h1>Bate-papo</h1>
          <p>Cartinhas para conversar, compartilhar ideias e conhecer os migles. Cada uma fica 48 horas.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setWriting(true)}>
            <Plus size={16} /> Escrever uma cartinha
          </button>
        </div>
      </header>
      {letters.status === "loading" ? (
        <p className="quiet">Abrindo as cartinhas...</p>
      ) : letters.status === "error" ? (
        <Empty title="Não foi possível abrir o Bate-papo.">{letters.error}</Empty>
      ) : letters.items.length ? (
        <div className="tarot-grid">
          {letters.items.map((letter, index) => (
            <LetterCard key={letter.id} letter={letter} index={letters.items.length - 1 - index} onChange={letters.replace} onRemove={letters.remove} />
          ))}
        </div>
      ) : (
        <Empty title="Nenhuma cartinha nas últimas 48 horas." mood="calm" action={<button className="btn primary" onClick={() => setWriting(true)}>Escrever a primeira</button>}>
          Que tal puxar assunto com os migles?
        </Empty>
      )}
      {writing && <LetterEditor onClose={() => setWriting(false)} onCreated={(letter) => { setWriting(false); letters.add(letter); }} />}
    </div>
  );
}
