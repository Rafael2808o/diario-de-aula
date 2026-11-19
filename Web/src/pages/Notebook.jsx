import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Bold, BookOpen, Cat, Check, Eye, FileQuestion, FlaskConical, Flame, Gem, Heading2, Heading3, Heart, ImagePlus, Italic, Layers, List, ListOrdered, Mic, Moon, Pilcrow, Quote, Redo2, ScrollText, Share2, Sparkles, Stamp, Star, Trash2, Underline, Undo2 } from "lucide-react";
import { useApp } from "../context.js";
import { formatFull, formatLong, todayIso, toDate, weekdays } from "../lib/dates.js";
import { htmlToText, sanitizeHtml } from "../lib/richtext.js";
import { blobToBase64, hydrateImages, preparePhoto } from "../lib/photo.js";
import { when } from "../lib/social.js";
import { Avatar, Empty, FormError, SubjectTag } from "../ui.jsx";
import { MaterialLinks } from "../components/forms.jsx";
import { PeoplePicker } from "../components/sala/People.jsx";
import Janela, { moonInfo } from "../components/caderno/Janela.jsx";
import { carimbos, figurinhaArt } from "../components/caderno/figurinhas.js";

// Caderno da aula: escrever durante a explicação, com salvamento automático.
// Enquanto a API não confirma, o texto fica guardado neste aparelho (localStorage), então cair a internet
// ou fechar a aba não perde nada: ao reabrir, a versão local mais nova volta e é enviada de novo.
// Versão 4.0: fotos dentro do resumo (slides, galeria, câmera), estudar com a IA a partir desta aula,
// compartilhar o caderno com colegas e receber recados com figurinhas.
const localKey = (id) => `grimiau.caderno.${id}`;
const readLocal = (id) => {
  try {
    return JSON.parse(localStorage.getItem(localKey(id)) || "null");
  } catch {
    return null;
  }
};
const writeLocal = (id, value) => {
  try {
    if (value) localStorage.setItem(localKey(id), JSON.stringify(value));
    else localStorage.removeItem(localKey(id));
  } catch {
    // Sem armazenamento, o texto ainda é enviado; só não sobrevive a fechar a aba sem internet.
  }
};

const tools = [
  { id: "h2", label: "Título", icon: Heading2, run: () => document.execCommand("formatBlock", false, "h2") },
  { id: "h3", label: "Subtítulo", icon: Heading3, run: () => document.execCommand("formatBlock", false, "h3") },
  { id: "p", label: "Parágrafo", icon: Pilcrow, run: () => document.execCommand("formatBlock", false, "p") },
  { id: "bold", label: "Negrito (Ctrl+B)", icon: Bold, run: () => document.execCommand("bold") },
  { id: "italic", label: "Itálico (Ctrl+I)", icon: Italic, run: () => document.execCommand("italic") },
  { id: "underline", label: "Sublinhado (Ctrl+U)", icon: Underline, run: () => document.execCommand("underline") },
  { id: "ul", label: "Lista com marcadores", icon: List, run: () => document.execCommand("insertUnorderedList") },
  { id: "ol", label: "Lista numerada", icon: ListOrdered, run: () => document.execCommand("insertOrderedList") },
  { id: "quote", label: "Citação", icon: Quote, run: () => document.execCommand("formatBlock", false, "blockquote") },
  { id: "undo", label: "Desfazer (Ctrl+Z)", icon: Undo2, run: () => document.execCommand("undo") },
  { id: "redo", label: "Refazer (Ctrl+Y)", icon: Redo2, run: () => document.execCommand("redo") },
];

const statusText = {
  saved: "Todas as alterações salvas",
  pending: "Alterações ainda não salvas",
  saving: "Salvando…",
  error: "Não foi possível salvar. Tentando novamente.",
  offline: "Sem conexão. O texto está guardado neste aparelho e será enviado quando a internet voltar.",
};

// Figurinhas gratuitas dos recados (mesma lista da API).
export const stickers = {
  lua: { label: "Lua", icon: Moon, tone: "gold" },
  estrela: { label: "Estrela", icon: Star, tone: "gold" },
  constelacao: { label: "Constelação", icon: Sparkles, tone: "lilac" },
  gato: { label: "Gatinho", icon: Cat, tone: "lilac" },
  livro: { label: "Livro", icon: BookOpen, tone: "lilac" },
  pocao: { label: "Poção", icon: FlaskConical, tone: "mint" },
  vela: { label: "Vela", icon: Flame, tone: "gold" },
  olho: { label: "Olho místico", icon: Eye, tone: "lilac" },
  cristal: { label: "Cristal", icon: Gem, tone: "sky" },
  coracao: { label: "Coração", icon: Heart, tone: "rose" },
  importante: { label: "Importante", stamp: "rose" },
  "cai-na-prova": { label: "Cai na prova", stamp: "gold" },
  revisar: { label: "Revisar", stamp: "lilac" },
  duvida: { label: "Dúvida", stamp: "sky" },
  dominei: { label: "Dominei", stamp: "mint" },
};

export function Sticker({ id }) {
  const sticker = stickers[id];
  if (!sticker) return null;
  if (sticker.stamp) return <span className={`stamp ${sticker.stamp}`}>{sticker.label}</span>;
  const art = figurinhaArt[id];
  if (!art) {
    const Icon = sticker.icon;
    return (
      <span className={`sticker tone-${sticker.tone}`} title={sticker.label}>
        <Icon size={20} aria-hidden="true" />
        <span className="sr-only">{sticker.label}</span>
      </span>
    );
  }
  return (
    <span className="figurinha" title={sticker.label}>
      <svg viewBox="0 0 64 64" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art }} />
      <span className="sr-only">{sticker.label}</span>
    </span>
  );
}

// Carimbos no texto não são editáveis por dentro (apagar com Backspace tira o carimbo inteiro).
const lockStamps = (root) => {
  for (const stamp of root?.querySelectorAll("span[data-stamp]") || []) stamp.contentEditable = "false";
};

// "Para revisar antes da prova": cada trecho com carimbo Cai na prova, Importante ou Revisar, e as dúvidas marcadas.
export function reviewFromHtml(html) {
  const result = { review: [], doubts: [], mastered: 0 };
  if (!html || !html.includes("data-stamp")) return result;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const seen = new Set();
  for (const stamp of doc.querySelectorAll("span[data-stamp]")) {
    const kind = stamp.dataset.stamp;
    if (kind === "dominei") result.mastered += 1;
    const block = stamp.closest("li, p, h2, h3, blockquote, div:not(:only-child)") || stamp.parentElement;
    const copy = block.cloneNode(true);
    copy.querySelectorAll("span[data-stamp], img").forEach((node) => node.remove());
    const text = copy.textContent.replace(/\s+/g, " ").trim().slice(0, 140);
    if (!text) continue;
    if (kind === "duvida") result.doubts.push(text);
    else if (["cai", "importante", "revisar"].includes(kind) && !seen.has(text)) {
      seen.add(text);
      result.review.push({ kind, text });
    }
  }
  return result;
}

function Editor({ lesson, onHtml }) {
  const { update, call, session, toast } = useApp();
  const box = useRef(null);
  const fileInput = useRef(null);
  const [stampsOpen, setStampsOpen] = useState(false);
  const [status, setStatus] = useState("saved");
  const [words, setWords] = useState(0);
  const [uploading, setUploading] = useState(0);
  const [photoError, setPhotoError] = useState("");
  const current = useRef("");
  const sent = useRef(lesson.annotations || "");
  const saving = useRef(false);
  const timer = useRef(null);
  const retry = useRef(0);
  const selection = useRef(null);

  const save = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current) return;
    const html = current.current;
    if (html === sent.current) {
      writeLocal(lesson.id, null);
      return setStatus("saved");
    }
    saving.current = true;
    setStatus("saving");
    try {
      const saved = await update("lessons", lesson.id, { annotations: html });
      sent.current = saved.annotations;
      retry.current = 0;
      saving.current = false;
      if (current.current === html) {
        writeLocal(lesson.id, null);
        setStatus("saved");
      } else save();
    } catch (failure) {
      saving.current = false;
      // Tenta de novo com espera crescente (3 s, 6 s, 12 s… até 1 min). O texto continua no aparelho.
      retry.current += 1;
      setStatus(failure instanceof TypeError || !navigator.onLine ? "offline" : "error");
      timer.current = setTimeout(save, Math.min(60_000, 3000 * 2 ** (retry.current - 1)));
    }
  }, [lesson.id, update]);

  // Abre com a versão mais nova: a do servidor ou uma cópia local que ainda não tinha sido enviada.
  useEffect(() => {
    const local = readLocal(lesson.id);
    const initial = local && local.html !== (lesson.annotations || "") ? local.html : lesson.annotations || "";
    box.current.innerHTML = sanitizeHtml(initial);
    hydrateImages(box.current, session.token);
    lockStamps(box.current);
    current.current = sanitizeHtml(initial);
    onHtml?.(current.current);
    setWords(htmlToText(initial).split(/\s+/).filter(Boolean).length);
    if (local && local.html !== (lesson.annotations || "")) {
      setStatus("pending");
      save();
    }
    // Só na abertura: depois disso, quem manda é o que está no editor.
  }, [lesson.id]);

  const changed = () => {
    const html = sanitizeHtml(box.current.innerHTML);
    current.current = html;
    onHtml?.(html);
    writeLocal(lesson.id, { html, at: Date.now() });
    setWords(htmlToText(html).split(/\s+/).filter(Boolean).length);
    setStatus((value) => (value === "saving" ? value : "pending"));
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 1200);
  };

  // Guarda onde o cursor estava, para a foto entrar no lugar certo mesmo depois de abrir a galeria.
  const rememberCaret = () => {
    const range = window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0) : null;
    if (range && box.current.contains(range.commonAncestorContainer)) selection.current = range.cloneRange();
  };

  const insertPhotos = async (files) => {
    setPhotoError("");
    let placed = 0;
    for (const file of files) {
      setUploading((value) => value + 1);
      try {
        const photo = await preparePhoto(file);
        const { id } = await call(`/lessons/${lesson.id}/imagens`, { method: "POST", body: { mime: "image/jpeg", data: await blobToBase64(photo.blob), width: photo.width, height: photo.height } });
        box.current.focus();
        const range = selection.current;
        if (range && box.current.contains(range.commonAncestorContainer)) {
          const chosen = window.getSelection();
          chosen.removeAllRanges();
          chosen.addRange(range);
        }
        document.execCommand("insertHTML", false, `<img data-img="${id}"><p><br></p>`);
        rememberCaret();
        hydrateImages(box.current, session.token);
        changed();
        placed += 1;
      } catch (failure) {
        setPhotoError(failure.message);
      } finally {
        setUploading((value) => value - 1);
      }
    }
    if (placed) toast(placed === 1 ? "Foto colocada no caderno." : `${placed} fotos colocadas no caderno.`);
  };

  useEffect(() => {
    const online = () => save();
    const guard = (event) => {
      if (current.current !== sent.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("online", online);
    window.addEventListener("beforeunload", guard);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("beforeunload", guard);
      clearTimeout(timer.current);
      // Saindo da página com alteração pendente: envia já (a cópia local continua até a API confirmar).
      if (current.current !== sent.current) save();
    };
  }, [save]);

  const insertStamp = (kind, label) => {
    setStampsOpen(false);
    box.current.focus();
    const range = selection.current;
    if (range && box.current.contains(range.commonAncestorContainer)) {
      const chosen = window.getSelection();
      chosen.removeAllRanges();
      chosen.addRange(range);
    }
    document.execCommand("insertHTML", false, `<span data-stamp="${kind}">${label}</span>&nbsp;`);
    lockStamps(box.current);
    rememberCaret();
    changed();
  };

  return (
    <section className="notebook" aria-label="Caderno da aula">
      <div className="notebook-toolbar" role="toolbar" aria-label="Formatação">
        {tools.map(({ id, label, icon: Icon, run }) => (
          <button
            key={id}
            type="button"
            className="icon-btn"
            title={label}
            aria-label={label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              box.current.focus();
              run();
              changed();
            }}
          >
            <Icon size={16} />
          </button>
        ))}
        <button type="button" className="btn small soft notebook-photo-btn" onMouseDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => fileInput.current.click()} disabled={uploading > 0}>
          <ImagePlus size={15} /> {uploading ? "Enviando foto…" : "Foto"}
        </button>
        <div className="stamp-pop">
          <button type="button" className="btn small soft" aria-expanded={stampsOpen} aria-haspopup="true" onMouseDown={(event) => { event.preventDefault(); rememberCaret(); }} onClick={() => setStampsOpen((open) => !open)}>
            <Stamp size={15} /> Carimbo
          </button>
          {stampsOpen && (
            <div className="stamp-menu" role="menu" aria-label="Carimbos">
              <p>Entra onde o cursor estiver. Cai na prova, Importante e Revisar vão para a lista de revisão.</p>
              {carimbos.map(([kind, label]) => (
                <button key={kind} type="button" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={() => insertStamp(kind, label)}>
                  <span data-stamp={kind}>{label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            const files = [...event.target.files];
            event.target.value = "";
            insertPhotos(files);
          }}
        />
        <span className={`save-state is-${status}`} role="status" aria-live="polite">
          {status === "saved" ? <Check size={14} aria-hidden="true" /> : status === "error" || status === "offline" ? <AlertCircle size={14} aria-hidden="true" /> : <span className="save-dot" aria-hidden="true" />}
          {statusText[status]}
        </span>
      </div>
      <FormError>{photoError}</FormError>
      <div className="notebook-sheet">
        <div
          ref={box}
          className="notebook-page"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Anotações da aula"
          data-placeholder="Comece a escrever durante a aula. Use Título e Subtítulo para separar os assuntos e Foto para colocar slides ou imagens."
          onInput={changed}
          onKeyUp={rememberCaret}
          onMouseUp={rememberCaret}
          onBlur={() => {
            rememberCaret();
            save();
          }}
          onPaste={(event) => {
            // Imagem colada (print de slide): vira foto do caderno.
            const pasted = [...event.clipboardData.files].filter((file) => file.type.startsWith("image/"));
            if (pasted.length) {
              event.preventDefault();
              rememberCaret();
              insertPhotos(pasted);
              return;
            }
            // Colagem de Word/Docs: mantém títulos, negrito, itálico e listas; tira estilos, links e imagens de fora.
            event.preventDefault();
            const html = event.clipboardData.getData("text/html");
            const text = event.clipboardData.getData("text/plain");
            const clean = html ? sanitizeHtml(html).replace(/<img data-img="[^"]+">/g, "") : text.split(/\n{2,}/).map((block) => `<p>${sanitizeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
            document.execCommand("insertHTML", false, clean);
            changed();
          }}
          onDrop={(event) => {
            const dropped = [...(event.dataTransfer?.files || [])].filter((file) => file.type.startsWith("image/"));
            if (!dropped.length) return;
            event.preventDefault();
            insertPhotos(dropped);
          }}
        />
      </div>
      <small className="hint notebook-count">
        {words} {words === 1 ? "palavra" : "palavras"} · as fotos entram onde o cursor estiver
      </small>
    </section>
  );
}

// Estudar a partir desta aula: as ferramentas recebem só o que foi escrito aqui (e o resto do registro da aula).
function StudyFromLesson({ lesson, subject }) {
  const { go } = useApp();
  const empty = !htmlToText(lesson.annotations) && !String(lesson.taught || "").trim();
  return (
    <div className="notebook-panel">
      <p className="hint">A IA usa o que você escreveu neste caderno e no registro desta aula, e cita a aula como fonte.</p>
      {empty && <p className="notice">Escreva algo no caderno primeiro: sem anotações, a IA não tem de onde tirar as perguntas.</p>}
      <div className="notebook-actions">
        <button className="btn soft" disabled={empty} onClick={() => go("cartoes", { lesson: lesson.id, criar: 1 })}>
          <Layers size={16} /> Gerar Cartas do Saber
        </button>
        <button className="btn soft" disabled={empty} onClick={() => go("ia", { tool: "questoes", lesson: lesson.id })}>
          <FileQuestion size={16} /> Criar questões
        </button>
        <button className="btn soft" disabled={empty} onClick={() => go("ia", { tool: "resumo", lesson: lesson.id })}>
          <ScrollText size={16} /> Revisão desta aula
        </button>
        <button className="btn soft" onClick={() => go("ia", { tool: "gravar", subject: subject.id, date: lesson.date })}>
          <Mic size={16} /> Gravar esta aula
        </button>
      </div>
    </div>
  );
}

function SharePanel({ lesson }) {
  const { call, toast } = useApp();
  const [people, setPeople] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    call(`/lessons/${lesson.id}/compartilhamento`)
      .then((result) => setPeople(result.people))
      .catch((failure) => setError(failure.message));
  }, [call, lesson.id]);
  const save = async (next) => {
    setBusy(true);
    setError("");
    try {
      const result = await call(`/lessons/${lesson.id}/compartilhamento`, { method: "PUT", body: { userIds: next.map((person) => person.id) } });
      setPeople(result.people);
      toast(result.people.length ? "Compartilhamento atualizado." : "O caderno não está mais compartilhado.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  if (!people) return <div className="notebook-panel">{error ? <FormError>{error}</FormError> : <p className="hint">Carregando…</p>}</div>;
  return (
    <div className="notebook-panel">
      <p className="hint">Quem você escolher lê este caderno (com as fotos) e pode deixar recados. Ninguém edita, e o resto do seu registro continua só seu.</p>
      <PeoplePicker value={people} onChange={save} max={30} label="Buscar colega para compartilhar" />
      {busy && <p className="hint">Salvando…</p>}
      <FormError>{error}</FormError>
    </div>
  );
}

function Notes({ lessonId, mine }) {
  const { call, toast } = useApp();
  const [state, setState] = useState({ status: "loading", notes: [] });
  const [body, setBody] = useState("");
  const [sticker, setSticker] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    call(`/cadernos/${lessonId}`)
      .then((result) => setState({ status: "ready", notes: result.notes }))
      .catch((failure) => setState({ status: "error", notes: [], error: failure.message }));
  }, [call, lessonId]);
  const send = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const notes = await call(`/cadernos/${lessonId}/recados`, { method: "POST", body: { body, sticker } });
      setState({ status: "ready", notes });
      setBody("");
      setSticker("");
      toast("Recado deixado no caderno.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const removeNote = async (id) => {
    try {
      setState({ status: "ready", notes: await call(`/cadernos/recados/${id}`, { method: "DELETE" }) });
    } catch (failure) {
      toast(failure.message);
    }
  };
  return (
    <div className="notebook-panel">
      {state.status === "loading" ? (
        <p className="hint">Carregando recados…</p>
      ) : state.status === "error" ? (
        <FormError>{state.error}</FormError>
      ) : state.notes.length ? (
        <ul className="notebook-notes">
          {state.notes.map((note) => (
            <li key={note.id}>
              <Avatar user={note.author} size={28} />
              <div>
                <strong>{note.author.name}</strong> <small>{when(note.createdAt)}</small>
                {note.sticker && (
                  <div>
                    <Sticker id={note.sticker} />
                  </div>
                )}
                {note.body && <p className="prewrap">{note.body}</p>}
              </div>
              {note.canDelete && (
                <button type="button" className="icon-btn" aria-label="Apagar recado" onClick={() => removeNote(note.id)}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">{mine ? "Nenhum recado ainda. Quando você compartilhar o caderno, os recados dos colegas aparecem aqui." : "Seja a primeira pessoa a deixar um recado."}</p>
      )}
      <form className="form notebook-note-form" onSubmit={send}>
        <label>
          Recado
          <textarea rows={2} maxLength={600} value={body} onChange={(event) => setBody(event.target.value)} placeholder={mine ? "Uma nota para você mesmo" : "Ex.: Valeu pelo resumo! A parte dos 4 tipos me salvou."} />
        </label>
        <fieldset className="plain-fieldset">
          <legend>Figurinha (opcional)</legend>
          <div className="sticker-picker">
            {Object.keys(stickers).map((id) => (
              <button key={id} type="button" className="sticker-option" aria-pressed={sticker === id} aria-label={stickers[id].label} onClick={() => setSticker(sticker === id ? "" : id)}>
                <Sticker id={id} />
              </button>
            ))}
          </div>
        </fieldset>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button className="btn primary" disabled={busy || (!body.trim() && !sticker)}>
            {busy ? "Enviando..." : "Deixar recado"}
          </button>
        </div>
      </form>
    </div>
  );
}

// Caderno de um colega, só para leitura.
function SharedNotebook({ lessonId }) {
  const { call, session, go } = useApp();
  const [state, setState] = useState({ status: "loading" });
  const page = useRef(null);
  useEffect(() => {
    call(`/cadernos/${lessonId}`)
      .then((notebook) => setState({ status: "ready", notebook }))
      .catch((failure) => setState({ status: "error", error: failure.message }));
  }, [call, lessonId]);
  useEffect(() => {
    if (state.status === "ready" && page.current) {
      page.current.innerHTML = sanitizeHtml(state.notebook.annotations);
      hydrateImages(page.current, session.token);
    }
  }, [state, session.token]);
  if (state.status === "loading") return <div className="page"><p className="quiet">Abrindo o caderno…</p></div>;
  if (state.status === "error") {
    return (
      <div className="page">
        <Empty title="Caderno indisponível" action={<button className="btn primary" onClick={() => go("caderno")}>Ver cadernos compartilhados</button>}>
          {state.error}
        </Empty>
      </div>
    );
  }
  const { notebook } = state;
  return (
    <div className="page notebook-page-wrap">
      <header className="page-head">
        <div>
          <button className="link-btn" onClick={() => go("caderno")}>
            <ArrowLeft size={14} /> Cadernos compartilhados
          </button>
          <h1>Caderno de {notebook.owner.name}</h1>
          <p className="notebook-meta">
            <SubjectTag subject={{ name: notebook.subjectName || "Disciplina", color: notebook.subjectColor || "var(--accent)" }} /> {formatLong(notebook.date)}
            {notebook.theme ? ` · ${notebook.theme}` : ""}
          </p>
        </div>
      </header>
      <div className="notebook-layout">
        <section className="notebook" aria-label="Caderno compartilhado">
          <div className="notebook-sheet">
            <div ref={page} className="notebook-page is-readonly" aria-label="Anotações da aula" />
          </div>
          {!htmlToText(notebook.annotations) && !notebook.annotations.includes("data-img") && <p className="hint">Este caderno ainda está em branco.</p>}
        </section>
        <aside className="notebook-side">
          <p className="paper-label">Recados</p>
          <Notes lessonId={lessonId} mine={false} />
        </aside>
      </div>
    </div>
  );
}

function SharedList() {
  const { call, go, data } = useApp();
  const [list, setList] = useState(null);
  useEffect(() => {
    call("/cadernos/compartilhados")
      .then(setList)
      .catch(() => setList([]));
  }, [call]);
  const recent = data.lessons.filter((lesson) => htmlToText(lesson.annotations) || String(lesson.annotations || "").includes("data-img")).slice(0, 6);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Cadernos</h1>
          <p>Seus cadernos de aula e os que colegas compartilharam com você.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => go("aulas")}>
            Abrir registro de aulas
          </button>
        </div>
      </header>
      <section>
        <h2 className="section-title">Compartilhados comigo</h2>
        {list === null ? (
          <p className="quiet">Carregando…</p>
        ) : list.length ? (
          <ul className="group">
            {list.map((item) => (
              <li key={item.id} className="row">
                <Avatar user={item.owner} size={30} />
                <button type="button" className="row-main row-link" onClick={() => go("caderno", { shared: item.id })}>
                  <strong>{item.theme || item.subjectName || "Caderno de aula"}</strong>
                  <small>
                    {item.owner.name} · {item.subjectName} · {formatFull(item.date)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint">Ninguém compartilhou um caderno com você ainda.</p>
        )}
      </section>
      {recent.length > 0 && (
        <section>
          <h2 className="section-title">Meus cadernos recentes</h2>
          <ul className="group">
            {recent.map((lesson) => {
              const subject = data.subjects.find((item) => item.id === lesson.subjectId);
              return (
                <li key={lesson.id} className="row">
                  <button type="button" className="row-main row-link" onClick={() => go("caderno", { lesson: lesson.id })}>
                    <strong>{lesson.theme || subject?.name || "Aula"}</strong>
                    <small>
                      {subject?.name} · {formatFull(lesson.date)}
                    </small>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

const panels = [
  ["estudar", "Estudar", "tab-lilac"],
  ["compartilhar", "Compartilhar", "tab-mint"],
  ["recados", "Recados", "tab-gold"],
  ["materiais", "Materiais", "tab-rose"],
];


// Escuro/Claro do papel do Caderno: escolha deste aparelho, separada do tema do app.
const paperKey = "grimiau.caderno.papel";
const ambientKey = "grimiau.caderno.janela";
const readPref = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const writePref = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento, a escolha vale até fechar a aba.
  }
};

const noAccent = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "");
const skipWords = new Set(["fundamentos", "introducao", "da", "de", "do", "das", "dos", "e", "a", "o"]);
// Sigla da disciplina para a aba lateral: "Fundamentos do Marketing" vira MAR.
const shortName = (name = "") => {
  const words = noAccent(name).split(/[^a-z0-9]+/i).filter(Boolean);
  const word = words.find((item) => !skipWords.has(item.toLowerCase())) || words[0] || "AULA";
  return word.slice(0, 3).toUpperCase();
};
const dayMonth = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const shortDay = (iso) => `${weekdays[toDate(iso).getUTCDay()].toLowerCase()}, ${dayMonth(iso)}`;

function FocusRow({ lesson }) {
  const { update } = useApp();
  const [value, setValue] = useState(lesson.theme || "");
  const timer = useRef(null);
  const sent = useRef(lesson.theme || "");
  const send = (next) => {
    clearTimeout(timer.current);
    if (next.trim() === sent.current.trim()) return;
    const previous = sent.current;
    sent.current = next;
    update("lessons", lesson.id, { theme: next.trim() }).catch(() => {
      sent.current = previous;
    });
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <label className="caderno-focus">
      <span>Foco da aula</span>
      <input
        type="text"
        maxLength={160}
        value={value}
        placeholder="O que você precisa tirar desta aula?"
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          clearTimeout(timer.current);
          timer.current = setTimeout(() => send(next), 1200);
        }}
        onBlur={() => send(value)}
      />
    </label>
  );
}

function ReviewBox({ html }) {
  const { review, doubts, mastered } = useMemo(() => reviewFromHtml(html), [html]);
  return (
    <div className="caderno-review">
      <h3>Para revisar antes da prova</h3>
      {review.length ? (
        <ul>
          {review.slice(0, 5).map((item) => (
            <li key={item.text} className={`is-${item.kind}`}>
              <i aria-hidden="true" />
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p>Use o Carimbo "Cai na prova", "Importante" ou "Revisar" num trecho e ele aparece aqui.</p>
      )}
      {review.length > 5 && <p>e mais {review.length - 5}</p>}
      <p className="caderno-review-foot">
        {doubts.length ? `${doubts.length} ${doubts.length === 1 ? "dúvida marcada" : "dúvidas marcadas"}` : "Nenhuma dúvida marcada"}
        {mastered > 0 && ` · ${mastered} ${mastered === 1 ? "trecho dominado" : "trechos dominados"}`}
      </p>
      {doubts.length > 0 && (
        <ul className="caderno-doubts">
          {doubts.slice(0, 3).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Notebook() {
  const { data, params, go } = useApp();
  const [panel, setPanel] = useState("estudar");
  const [html, setHtml] = useState("");
  const [paper, setPaperState] = useState(() => readPref(paperKey, document.documentElement.dataset.theme === "light" ? "claro" : "escuro"));
  const [ambient, setAmbient] = useState(() => readPref(ambientKey, ""));
  const tray = useRef(null);
  const today = todayIso();
  // Aulas do caderno (abas laterais e seletor): as já dadas, da mais nova para a mais antiga.
  const recent = useMemo(
    () =>
      [...data.lessons]
        .filter((item) => item.date <= today)
        .sort((a, b) => (b.date + (b.startTime || "")).localeCompare(a.date + (a.startTime || "")))
        .slice(0, 40),
    [data.lessons, today],
  );
  if (params.shared) return <SharedNotebook lessonId={params.shared} />;
  const lesson = data.lessons.find((item) => item.id === params.lesson);
  const subject = lesson && data.subjects.find((item) => item.id === lesson.subjectId);
  if (!params.lesson) return <SharedList />;
  if (!lesson || !subject) {
    return (
      <div className="page">
        <Empty title="Aula não encontrada" action={<button className="btn primary" onClick={() => go("aulas")}>Abrir registro de aulas</button>}>
          Abra o caderno a partir de uma aula no Registro de aulas.
        </Empty>
      </div>
    );
  }
  const subjectOf = (item) => data.subjects.find((entry) => entry.id === item.subjectId);
  const materials = data.materials.filter((material) => material.lessonId === lesson.id);
  const hasContent = Boolean(htmlToText(html)) || html.includes("data-img");
  const listed = recent.some((item) => item.id === lesson.id) ? recent : [lesson, ...recent];
  const sideTabs = listed.slice(0, 7).some((item) => item.id === lesson.id) ? listed.slice(0, 7) : [lesson, ...listed.slice(0, 6)];
  const setPaper = (value) => {
    setPaperState(value);
    writePref(paperKey, value);
  };
  const toggleAmbient = (flag) => {
    const set = new Set(ambient.split(" ").filter(Boolean));
    if (set.has(flag)) set.delete(flag);
    else set.add(flag);
    const next = [...set].join(" ");
    setAmbient(next);
    writePref(ambientKey, next);
  };
  const openPanel = (id) => {
    setPanel(id);
    // Em tela estreita a bandeja fica embaixo do caderno: rola até ela.
    if (window.matchMedia("(max-width: 1099px)").matches) setTimeout(() => tray.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };
  const moon = moonInfo();
  const rainy = ambient.includes("chuva");
  const still = ambient.includes("pausa");
  const panelTitle = panels.find(([id]) => id === panel)?.[1];
  return (
    <div className="page notebook-page-wrap caderno-v2" data-paper={paper}>
      <header className="caderno-head">
        <nav className="caderno-crumbs" aria-label="Caminho">
          <button type="button" onClick={() => go("conteudos")}>Grimório</button>
          <i aria-hidden="true">/</i>
          <button type="button" onClick={() => go("aulas", { lesson: lesson.id })}>{subject.name}</button>
          <i aria-hidden="true">/</i>
          <b>Caderno de aula</b>
        </nav>
        <div className="caderno-titlerow">
          <div>
            <h1>Caderno de aula</h1>
            <div className="caderno-meta">
              <SubjectTag subject={subject} />
              <span>
                Aula de {formatLong(lesson.date)}
                {lesson.startTime ? ` · ${lesson.startTime}` : ""}
              </span>
              <span className={`caderno-chip ${hasContent ? "ok" : "warn"}`}>{hasContent ? "Com conteúdo" : "Sem conteúdo"}</span>
            </div>
          </div>
          <div className="caderno-ctl">
            <label className="caderno-picker">
              <span>Aula</span>
              <select value={lesson.id} onChange={(event) => go("caderno", { lesson: event.target.value })}>
                {listed.map((item) => (
                  <option key={item.id} value={item.id}>
                    {subjectOf(item)?.name || "Aula"} · {shortDay(item.date)}
                  </option>
                ))}
              </select>
            </label>
            <div className="caderno-picker">
              <span id="caderno-papel">Caderno</span>
              <div className="caderno-seg" role="group" aria-labelledby="caderno-papel">
                <button type="button" aria-pressed={paper === "escuro"} onClick={() => setPaper("escuro")}>Escuro</button>
                <button type="button" aria-pressed={paper === "claro"} onClick={() => setPaper("claro")}>Claro</button>
              </div>
            </div>
            <button className="btn soft caderno-share" onClick={() => openPanel("compartilhar")}>
              <Share2 size={16} /> Compartilhar
            </button>
          </div>
        </div>
      </header>
      <div className="caderno-workspace">
        <main className="caderno-book">
          <div className="caderno-bookin">
            <div className="caderno-cover">
              <div className="caderno-spread">
                <section className="caderno-pg left" aria-label="Página de escrever">
                  <div className="caderno-lhd">
                    <div className="caderno-pagehead">Conteúdo da aula</div>
                    <FocusRow key={lesson.id} lesson={lesson} />
                  </div>
                  <Editor key={lesson.id} lesson={lesson} onHtml={setHtml} />
                </section>
                <section className="caderno-pg right" aria-label="Janela do grimório">
                  <div className="caderno-pagehead">Janela do grimório</div>
                  <div className="caderno-scene">
                    <Janela rainy={rainy} still={still} />
                    <div className="caderno-ambient">
                      <span className="caderno-moon">
                        Hoje: {moon.name} · {Math.round(moon.lit * 100)}% iluminada
                      </span>
                      <button type="button" className="btn small soft" aria-pressed={rainy} onClick={() => toggleAmbient("chuva")}>Chuva</button>
                      <button type="button" className="btn small soft" aria-pressed={still} onClick={() => toggleAmbient("pausa")}>
                        {still ? "Retomar animações" : "Pausar animações"}
                      </button>
                    </div>
                  </div>
                  <ReviewBox html={html} />
                </section>
              </div>
              <nav className="caderno-side" aria-label="Outras aulas">
                {sideTabs.map((item) => {
                  const itemSubject = subjectOf(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="caderno-stab"
                      style={{ "--gc": itemSubject?.color || "var(--tab-lilac)" }}
                      title={`${itemSubject?.name || "Aula"} · ${formatLong(item.date)}`}
                      aria-current={item.id === lesson.id ? "page" : undefined}
                      onClick={() => item.id !== lesson.id && go("caderno", { lesson: item.id })}
                    >
                      {shortName(itemSubject?.name)} · {dayMonth(item.date)}
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="caderno-guides" role="group" aria-label="Painel do caderno">
              {panels.map(([id, label, tone]) => (
                <button key={id} type="button" className={`caderno-guide ${tone}`} aria-pressed={panel === id} onClick={() => openPanel(id)}>
                  {label}
                  {id === "materiais" && materials.length > 0 && <span className="count">{materials.length}</span>}
                </button>
              ))}
            </div>
          </div>
        </main>
        <aside className="caderno-tray" ref={tray} aria-label={panelTitle}>
          <h2>{panelTitle}</h2>
          {panel === "estudar" && <StudyFromLesson lesson={{ ...lesson, annotations: html || lesson.annotations }} subject={subject} />}
          {panel === "compartilhar" && <SharePanel lesson={lesson} />}
          {panel === "recados" && <Notes lessonId={lesson.id} mine />}
          {panel === "materiais" && (
            <div className="notebook-panel">
              {materials.length ? (
                <ul className="group">
                  {materials.map((material) => (
                    <li key={material.id} className="row">
                      <span className="badge">{material.type}</span>
                      <MaterialLinks material={material} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">{lesson.noMaterial ? "Esta aula não teve material disponibilizado." : "Nenhum material anexado ainda. Dá para anotar mesmo assim."}</p>
              )}
              <p className="hint">As fotos dos slides continuam em Materiais. As fotos que você coloca no caderno ficam só dentro do resumo.</p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
