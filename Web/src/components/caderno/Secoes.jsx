import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Minus, Plus, RotateCw, Sparkles, Trash2, X } from "lucide-react";
import { useApp } from "../../context.js";
import { pageStickerArt, stickerGroups } from "./figurinhas.js";

// Partes do Caderno guardadas fora do texto (versão 4.2): tópicos, dúvidas e figurinhas soltas (API: /lessons/:id/extras).
// A tela manda só a parte que mudou, 700 ms depois da última mudança; ao sair da aula, envia na hora.
const newId = () => Math.random().toString(36).slice(2, 10);

export function useExtras(lessonId) {
  const { call } = useApp();
  const [extras, setExtras] = useState({ topics: [], doubts: [], stickers: [] });
  const [status, setStatus] = useState("loading");
  const pending = useRef({});
  const timer = useRef(null);
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const body = pending.current;
    if (!Object.keys(body).length) return;
    pending.current = {};
    setStatus("saving");
    try {
      await call(`/lessons/${lessonId}/extras`, { method: "PUT", body });
      setStatus("saved");
    } catch {
      // Devolve para a fila e tenta de novo em 5 s (sem perder o que mudou nesse meio-tempo).
      pending.current = { ...body, ...pending.current };
      setStatus("error");
      timer.current = setTimeout(flush, 5000);
    }
  }, [call, lessonId]);
  useEffect(() => {
    let alive = true;
    call(`/lessons/${lessonId}/extras`)
      .then((result) => alive && (setExtras(result), setStatus("saved")))
      .catch(() => alive && setStatus("error"));
    return () => {
      alive = false;
    };
  }, [call, lessonId]);
  useEffect(() => () => flush(), [flush]);
  const change = useCallback(
    (key, value) => {
      setExtras((current) => {
        const next = typeof value === "function" ? value(current[key]) : value;
        pending.current[key] = next;
        return { ...current, [key]: next };
      });
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, 700);
    },
    [flush],
  );
  return { extras, change, status, flush };
}

const listCopy = {
  topics: { hint: "O que não pode ficar de fora desta aula. Marque o que cai na prova e risque o que já revisou.", add: "Novo tópico", done: "Revisado", unit: "revisados", empty: "Nenhum tópico ainda. Escreva o primeiro abaixo." },
  doubts: { hint: "Anote agora, pergunte depois. Marque como resolvida quando tirar a dúvida.", add: "Nova dúvida", done: "Resolvida", unit: "resolvidas", empty: "Nenhuma dúvida por enquanto." },
};

function Progress({ done, total, unit }) {
  return (
    <div className="caderno-progress">
      <span>{total ? `${done} de ${total} ${unit}` : ""}</span>
      <i aria-hidden="true">
        <b style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
      </i>
    </div>
  );
}

export function ExtrasList({ kind, items, onChange, readOnly = false }) {
  const copy = listCopy[kind];
  const [text, setText] = useState("");
  const set = (id, patch) => onChange((list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  return (
    <div className="caderno-list">
      {!readOnly && <p className="caderno-list-hint">{copy.hint}</p>}
      <Progress done={items.filter((item) => item.d).length} total={items.length} unit={copy.unit} />
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={item.id} className={item.d ? "is-done" : ""}>
              <label className="caderno-check">
                <input type="checkbox" checked={item.d} disabled={readOnly} aria-label={copy.done} onChange={(event) => set(item.id, { d: event.target.checked })} />
                <span aria-hidden="true">
                  <Check size={14} />
                </span>
              </label>
              {readOnly ? (
                <span className="caderno-list-text">{item.t}</span>
              ) : (
                <textarea rows={1} maxLength={300} value={item.t} aria-label="Texto" onChange={(event) => set(item.id, { t: event.target.value })} onBlur={(event) => !event.target.value.trim() && onChange((list) => list.filter((entry) => entry.id !== item.id))} />
              )}
              {kind === "topics" && (
                <button type="button" className="caderno-flag" aria-pressed={item.f} disabled={readOnly} onClick={() => set(item.id, { f: !item.f })}>
                  Cai na prova
                </button>
              )}
              {!readOnly && (
                <button type="button" className="caderno-x" aria-label="Remover" onClick={() => onChange((list) => list.filter((entry) => entry.id !== item.id))}>
                  <X size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="caderno-empty">{copy.empty}</p>
      )}
      {!readOnly && (
        <form
          className="caderno-add"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) return;
            onChange((list) => [...list, kind === "topics" ? { id: newId(), t: text.trim(), f: false, d: false } : { id: newId(), t: text.trim(), d: false }]);
            setText("");
          }}
        >
          <input value={text} maxLength={300} placeholder={copy.add} aria-label={copy.add} onChange={(event) => setText(event.target.value)} />
          <button className="btn primary">Adicionar</button>
        </form>
      )}
    </div>
  );
}

// Cartas rápidas: são Cartas do Saber de verdade, ligadas à aula (aparecem também na página Cartas do Saber).
const cardLevels = [
  ["difícil", "Não sei"],
  ["dúvida", "Revisar"],
  ["fácil", "Dominei"],
];
export function LessonCards({ lesson }) {
  const { data, create, update, remove, toast } = useApp();
  const cards = data.flashcards.filter((card) => card.lessonId === lesson.id);
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async (event) => {
    event.preventDefault();
    if (!front.trim() || !back.trim()) return;
    setBusy(true);
    try {
      await create("flashcards", { subjectId: lesson.subjectId, lessonId: lesson.id, front: front.trim(), back: back.trim(), deck: lesson.theme || "" });
      setFront("");
      setBack("");
    } catch (failure) {
      toast(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="caderno-list">
      <p className="caderno-list-hint">Perguntas e respostas curtas para revisar depois. Elas também entram nas Cartas do Saber, no conjunto desta aula.</p>
      <Progress done={cards.filter((card) => card.level === "fácil").length} total={cards.length} unit="dominadas" />
      {cards.length ? (
        <ul className="caderno-cards">
          {cards.map((card) => (
            <li key={card.id}>
              <div>
                <small>Pergunta</small>
                <p>{card.front}</p>
              </div>
              <div>
                <small>Resposta</small>
                <p>{card.back}</p>
              </div>
              <button type="button" className="caderno-x" aria-label="Apagar carta" onClick={() => remove("flashcards", card.id).catch((failure) => toast(failure.message))}>
                <X size={16} />
              </button>
              <div className="caderno-card-levels" role="group" aria-label="Como está esta carta">
                {cardLevels.map(([level, label]) => (
                  <button key={level} type="button" className={`lv-${level === "difícil" ? "ns" : level === "dúvida" ? "rv" : "dm"}`} aria-pressed={card.level === level} onClick={() => update("flashcards", card.id, { level: card.level === level ? "nova" : level }).catch((failure) => toast(failure.message))}>
                    {label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="caderno-empty">Nenhuma carta ainda.</p>
      )}
      <form className="caderno-card-form" onSubmit={add}>
        <label>
          <small>Pergunta</small>
          <textarea rows={2} maxLength={300} value={front} onChange={(event) => setFront(event.target.value)} />
        </label>
        <label>
          <small>Resposta</small>
          <textarea rows={2} maxLength={1200} value={back} onChange={(event) => setBack(event.target.value)} />
        </label>
        <button className="btn primary" disabled={busy || !front.trim() || !back.trim()}>
          {busy ? "Salvando…" : "Nova carta"}
        </button>
      </form>
    </div>
  );
}

export function StickerArt({ kind }) {
  const art = pageStickerArt[kind];
  if (!art) return null;
  return <svg viewBox={art.wide ? "0 0 140 44" : "0 0 64 64"} aria-hidden="true" dangerouslySetInnerHTML={{ __html: art.body }} />;
}

// Figurinhas por cima de uma página. x é a fração da largura; y, pixels a partir do topo. Arrasta com o dedo ou o mouse.
export function StickerLayer({ stickers, page, section, selected, onSelect, onMove, readOnly = false }) {
  const box = useRef(null);
  const drag = useRef(null);
  const shown = stickers.filter((item) => item.p === page && (page === "R" || item.sec === section)).sort((a, b) => a.z - b.z);
  const start = (event, item, mode) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(item.id);
    const rect = box.current.getBoundingClientRect();
    drag.current = { id: item.id, mode, rect, sx: event.clientX, sy: event.clientY, x: item.x, y: item.y, s: item.s };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.sx;
    const dy = event.clientY - current.sy;
    if (current.mode === "size") onMove(current.id, { s: Math.max(24, Math.min(220, Math.round(current.s + Math.max(dx, dy)))) }, false);
    else onMove(current.id, { x: Math.max(0, Math.min(1, current.x + dx / current.rect.width)), y: Math.max(0, Math.round(current.y + dy)) }, false);
  };
  const end = () => {
    if (!drag.current) return;
    onMove(drag.current.id, {}, true);
    drag.current = null;
  };
  return (
    <div className="sticker-layer" ref={box} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {shown.map((item) => {
        const art = pageStickerArt[item.k];
        if (!art) return null;
        const width = item.s;
        return (
          <div
            key={item.id}
            className={`page-sticker${item.sh ? " shiny" : ""}${selected === item.id ? " on" : ""}${readOnly ? " readonly" : ""}`}
            style={{ left: `calc(${item.x * 100}% - ${width / 2}px)`, top: item.y, width, height: art.wide ? (width * 44) / 140 : width, transform: `rotate(${item.r}deg)`, zIndex: item.z }}
            role={readOnly ? "img" : "button"}
            tabIndex={readOnly ? -1 : 0}
            aria-label={`Figurinha ${art.label}`}
            onPointerDown={(event) => start(event, item, "move")}
            onKeyDown={(event) => {
              if (readOnly) return;
              const step = event.shiftKey ? 20 : 5;
              const keys = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
              if (keys[event.key]) {
                event.preventDefault();
                const width = box.current.getBoundingClientRect().width || 1;
                onMove(item.id, { x: Math.max(0, Math.min(1, item.x + keys[event.key][0] / width)), y: Math.max(0, item.y + keys[event.key][1]) }, true);
              } else if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(item.id);
              }
            }}
          >
            <StickerArt kind={item.k} />
            {!readOnly && selected === item.id && <span className="sticker-handle" aria-hidden="true" onPointerDown={(event) => start(event, item, "size")} />}
          </div>
        );
      })}
    </div>
  );
}

export function StickerTray({ onAdd, count, onClear }) {
  return (
    <div className="sticker-tray">
      <p className="hint">Toque para colar na página. Depois arraste até o lugar certo. As da página da esquerda ficam na seção em que foram coladas.</p>
      {stickerGroups.map((group) => (
        <div key={group} className="sticker-group">
          <h3>{group}</h3>
          <div className={`sticker-grid${group === "Carimbos" ? " wide" : ""}`}>
            {Object.entries(pageStickerArt)
              .filter(([, art]) => art.group === group)
              .map(([kind, art]) => (
                <button key={kind} type="button" className="sticker-pick" aria-label={`Colar ${art.label}`} title={art.label} onClick={() => onAdd(kind)}>
                  <StickerArt kind={kind} />
                </button>
              ))}
          </div>
        </div>
      ))}
      <div className="sticker-tray-foot">
        <span>{count ? `${count} ${count === 1 ? "figurinha" : "figurinhas"} nesta aula` : "Nenhuma figurinha ainda"}</span>
        {count > 0 && (
          <button type="button" className="btn small soft" onClick={onClear}>
            Limpar figurinhas
          </button>
        )}
      </div>
    </div>
  );
}

export function StickerPill({ sticker, onChange, onDuplicate, onFront, onDelete, onDone }) {
  const art = pageStickerArt[sticker.k];
  return (
    <div className="sticker-pill" role="toolbar" aria-label="Figurinha selecionada">
      <span className="sticker-pill-name">{art?.label}</span>
      <button type="button" className="btn small soft" aria-pressed={sticker.sh} onClick={() => onChange({ sh: !sticker.sh })}>
        <Sparkles size={14} /> Brilho
      </button>
      <button type="button" className="btn small soft" aria-label="Diminuir" onClick={() => onChange({ s: Math.max(24, sticker.s - 12) })}>
        <Minus size={14} />
      </button>
      <button type="button" className="btn small soft" aria-label="Aumentar" onClick={() => onChange({ s: Math.min(220, sticker.s + 12) })}>
        <Plus size={14} />
      </button>
      <button type="button" className="btn small soft" aria-label="Girar" onClick={() => onChange({ r: sticker.r >= 45 ? -45 : sticker.r + 15 })}>
        <RotateCw size={14} />
      </button>
      <button type="button" className="btn small soft" onClick={onDuplicate}>
        <Copy size={14} /> Duplicar
      </button>
      <button type="button" className="btn small soft" onClick={onFront}>
        Trazer à frente
      </button>
      <button type="button" className="btn small soft danger-text" onClick={onDelete}>
        <Trash2 size={14} /> Excluir
      </button>
      <button type="button" className="btn small primary" onClick={onDone}>
        Pronto
      </button>
    </div>
  );
}

export const makeSticker = (kind, page, section, list, y = 40) => ({
  id: newId(),
  k: kind,
  p: page,
  sec: section,
  x: 0.35 + Math.random() * 0.3,
  y: Math.round(y + Math.random() * 60),
  s: pageStickerArt[kind]?.size || 70,
  r: Math.round(Math.random() * 16 - 8),
  z: list.reduce((max, item) => Math.max(max, item.z), 0) + 1,
  sh: false,
});
