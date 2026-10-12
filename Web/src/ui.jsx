import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { Check, X } from "lucide-react";

// Nox: um só desenho em todas as telas, em cores chapadas; só a expressão muda (calm, happy, sleepy).
export function Nox({ size = 72, mood = "calm", className = "" }) {
  const closed = mood === "happy" || mood === "sleepy";
  return (
    <svg className={`nox ${className}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label="Nox, o gatinho do Lúmina">
      <path className="nox-body" d="M36 113c-4-18 6-30 24-30s28 12 24 30c-1 4-47 4-48 0z" />
      <path d="M80 110c12 2 22-3 23-13 .6-6-3-9-6.5-8.5" fill="none" strokeWidth="6.5" strokeLinecap="round" stroke="var(--nox-fur)" />
      <path className="nox-body" d="M22 60c0-12 3.5-22 9.5-30L29 10l20 13c3.5-1 7.3-1.5 11-1.5s7.5.5 11 1.5l20-13-2.5 20c6 8 9.5 18 9.5 30 0 18-17 28-38 28S22 78 22 60z" />
      <path d="M33 17l12 8-9.5 6zM87 17l-12 8 9.5 6z" fill="var(--nox-ear)" />
      <path d="M63 27a8 8 0 1 0 0 14 6.4 6.4 0 1 1 0-14z" fill="var(--nox-moon)" />
      {closed ? (
        <g fill="none" stroke="var(--nox-eye)" strokeWidth="3" strokeLinecap="round">
          <path d={mood === "sleepy" ? "M39 58h14M67 58h14" : "M39 59q7-6 14 0M67 59q7-6 14 0"} />
        </g>
      ) : (
        <g>
          <path d="M37 57c3-7 13-8 17-1-2 7-14 8-17 1z" fill="var(--nox-eye)" />
          <path d="M66 56c4-7 14-6 17 1-3 7-15 6-17-1z" fill="var(--nox-eye)" />
          <ellipse cx="46" cy="56.5" rx="2" ry="4.6" fill="var(--nox-pupil)" />
          <ellipse cx="74.5" cy="56.5" rx="2" ry="4.6" fill="var(--nox-pupil)" />
          <circle cx="43.5" cy="54" r="1.4" fill="#fff" />
          <circle cx="72" cy="54" r="1.4" fill="#fff" />
        </g>
      )}
      <path d="M57.5 68l2.5 2 2.5-2" fill="none" stroke="var(--nox-nose)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M100 26l1.6 3.6 3.6 1.6-3.6 1.6-1.6 3.6-1.6-3.6-3.6-1.6 3.6-1.6z" fill="var(--nox-moon)" />
    </svg>
  );
}

// Seção agrupada: título fora do bloco, conteúdo numa superfície única (padrão de listas agrupadas).
export function Card({ title, action, children, className = "", as: Tag = "section" }) {
  return (
    <Tag className={`panel ${className}`}>
      {(title || action) && (
        <header className="section-head">
          {title && <h2 className="section-title">{title}</h2>}
          {action}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </Tag>
  );
}

export function Empty({ title, children, action, mood = "calm", compact = false }) {
  return (
    <div className={`empty ${compact ? "compact" : ""}`}>
      <Nox size={compact ? 48 : 68} mood={mood} />
      <div>
        <strong>{title}</strong>
        {children && <p>{children}</p>}
        {action}
      </div>
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false }) {
  const titleId = useId();
  const panel = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const first = panel.current?.querySelector("input, select, textarea, button:not(.modal-close)");
    first?.focus();
    // Com janelas empilhadas, só a de cima responde ao Esc.
    const onKey = (event) => {
      const open = document.querySelectorAll(".modal");
      if (event.key === "Escape" && open[open.length - 1] === panel.current) closeRef.current();
    };
    document.addEventListener("keydown", onKey);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", onKey);
      if (document.querySelectorAll(".modal").length <= 1) document.body.classList.remove("modal-open");
      previous?.focus?.();
    };
  }, []);
  return (
    <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={`modal ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panel}>
        <header>
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn modal-close" aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Confirm({ title, message, confirmLabel = "Excluir", onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <p className="modal-text">{message}</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button
          type="button"
          className="btn danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await onConfirm();
              onClose();
            } catch (failure) {
              setError(failure.message || "Não foi possível excluir.");
              setBusy(false);
            }
          }}
        >
          {busy ? "Excluindo..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

// Envolve um formulário: trava o botão enquanto salva e só fecha/avisa depois da resposta da API.
export function useSubmit(action, { success, onDone } = {}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = useCallback(
    async (...args) => {
      setBusy(true);
      setError("");
      try {
        const result = await action(...args);
        if (success) toast(success);
        onDone?.(result);
        return result;
      } catch (failure) {
        setError(
          failure instanceof TypeError
            ? "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
            : failure.message || "Não foi possível salvar.",
        );
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [action, success, onDone, toast],
  );
  return { submit, busy, error, setError };
}

export function SubjectTag({ subject, small = false }) {
  if (!subject) return <span className="subject-tag muted">Sem disciplina</span>;
  return (
    <span className={`subject-tag ${small ? "small" : ""}`} style={{ "--subject": subject.color }}>
      <i aria-hidden="true" />
      {subject.name}
    </span>
  );
}

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [message]);
  return (
    <ToastContext.Provider value={setMessage}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {message && (
          <div className="toast">
            <Check size={16} aria-hidden="true" />
            <span>{message}</span>
            <button type="button" className="icon-btn" aria-label="Fechar aviso" onClick={() => setMessage("")}>
              <X size={14} />
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => {
        const [id, text] = Array.isArray(option) ? option : [option, option];
        return (
          <button type="button" key={id} aria-pressed={value === id} className={value === id ? "active" : ""} onClick={() => onChange(id)}>
            {text}
          </button>
        );
      })}
    </div>
  );
}

export function FormError({ children }) {
  return children ? (
    <p className="form-error" role="alert">
      {children}
    </p>
  ) : null;
}
