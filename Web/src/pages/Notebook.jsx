import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Bold, Check, Heading2, Heading3, Italic, List, ListOrdered, Mic, Pilcrow, Quote, Redo2, Underline, Undo2 } from "lucide-react";
import { useApp } from "../context.js";
import { formatLong } from "../lib/dates.js";
import { htmlToText, sanitizeHtml } from "../lib/richtext.js";
import { Empty, SubjectTag } from "../ui.jsx";
import { MaterialLinks } from "../components/forms.jsx";

// Caderno da aula: escrever durante a explicação, com salvamento automático.
// Enquanto a API não confirma, o texto fica guardado neste aparelho (localStorage), então cair a internet
// ou fechar a aba não perde nada: ao reabrir, a versão local mais nova volta e é enviada de novo.
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

function Editor({ lesson }) {
  const { update } = useApp();
  const box = useRef(null);
  const [status, setStatus] = useState("saved");
  const [words, setWords] = useState(0);
  const current = useRef("");
  const sent = useRef(lesson.annotations || "");
  const saving = useRef(false);
  const timer = useRef(null);
  const retry = useRef(0);

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
    current.current = sanitizeHtml(initial);
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
    writeLocal(lesson.id, { html, at: Date.now() });
    setWords(htmlToText(html).split(/\s+/).filter(Boolean).length);
    setStatus((value) => (value === "saving" ? value : "pending"));
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 1200);
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
        <span className={`save-state is-${status}`} role="status" aria-live="polite">
          {status === "saved" ? <Check size={14} aria-hidden="true" /> : status === "error" || status === "offline" ? <AlertCircle size={14} aria-hidden="true" /> : <span className="save-dot" aria-hidden="true" />}
          {statusText[status]}
        </span>
      </div>
      <div
        ref={box}
        className="notebook-page"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Anotações da aula"
        data-placeholder="Comece a escrever durante a aula. Use Título e Subtítulo para separar os assuntos."
        onInput={changed}
        onBlur={() => save()}
        onPaste={(event) => {
          // Colagem de Word/Docs: mantém títulos, negrito, itálico e listas; tira estilos, links e imagens.
          event.preventDefault();
          const html = event.clipboardData.getData("text/html");
          const text = event.clipboardData.getData("text/plain");
          const clean = html ? sanitizeHtml(html) : text.split(/\n{2,}/).map((block) => `<p>${sanitizeHtml(block).replace(/\n/g, "<br>")}</p>`).join("");
          document.execCommand("insertHTML", false, clean);
          changed();
        }}
      />
      <small className="hint notebook-count">{words} {words === 1 ? "palavra" : "palavras"}</small>
    </section>
  );
}

export default function Notebook() {
  const { data, params, go } = useApp();
  const lesson = data.lessons.find((item) => item.id === params.lesson);
  const subject = lesson && data.subjects.find((item) => item.id === lesson.subjectId);
  if (!lesson || !subject) {
    return (
      <div className="page">
        <Empty title="Aula não encontrada" action={<button className="btn primary" onClick={() => go("aulas")}>Abrir registro de aulas</button>}>
          Abra o caderno a partir de uma aula no Registro de aulas.
        </Empty>
      </div>
    );
  }
  const materials = data.materials.filter((material) => material.lessonId === lesson.id);
  return (
    <div className="page notebook-page-wrap">
      <header className="page-head">
        <div>
          <button className="link-btn" onClick={() => go("aulas", { lesson: lesson.id })}>
            <ArrowLeft size={14} /> Voltar ao registro da aula
          </button>
          <h1>Caderno da aula</h1>
          <p className="notebook-meta">
            <SubjectTag subject={subject} /> {formatLong(lesson.date)}
            {lesson.startTime ? `, ${lesson.startTime}` : ""}
            {lesson.theme ? ` · ${lesson.theme}` : ""}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn soft" onClick={() => go("ia", { tool: "gravar", subject: subject.id, date: lesson.date })}>
            <Mic size={16} /> Gravar esta aula
          </button>
        </div>
      </header>
      <div className="notebook-layout">
        <Editor lesson={lesson} />
        <aside className="notebook-side">
          <h2 className="section-title">Materiais da aula</h2>
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
          <p className="hint">O caderno é separado dos arquivos: anotar não muda nenhum material, e excluir um material não apaga o caderno.</p>
        </aside>
      </div>
    </div>
  );
}
