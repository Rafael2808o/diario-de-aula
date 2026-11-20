import { useEffect, useRef, useState } from "react";
import { useApp } from "../context.js";
import { vibeOf, vibes } from "../lib/vibes.js";

export function VibeChip({ vibe }) {
  const info = vibeOf(vibe);
  if (!info) return null;
  return (
    <span className="vibe-chip" style={{ "--vc": info.color }}>
      <i aria-hidden="true" /> {info.label}
    </span>
  );
}

// Botão "Definir vibe" com a lista. Mudar a vibe salva na hora; tocar na mesma de novo tira.
export function VibePicker({ value, onChange, compact = false }) {
  const { call, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => !box.current?.contains(event.target) && setOpen(false);
    const esc = (event) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const pick = async (id) => {
    setBusy(true);
    try {
      const result = await call("/vitrine/vibe", { method: "PUT", body: { vibe: id === value ? "" : id } });
      onChange(result.vibe);
      setOpen(false);
    } catch (failure) {
      toast(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const info = vibeOf(value);
  return (
    <div className="vibe-picker" ref={box}>
      <button type="button" className={`vibe-chip ${info ? "" : "is-unset"}${compact ? " compact" : ""}`} style={info ? { "--vc": info.color } : undefined} aria-expanded={open} onClick={() => setOpen(!open)}>
        <i aria-hidden="true" /> {info ? info.label : "Definir vibe"}
      </button>
      {open && (
        <div className="vibe-menu" role="group" aria-label="Sua vibe hoje">
          <p>Sua vibe hoje. Some sozinha em 24 horas.</p>
          {vibes.map((vibe) => (
            <button key={vibe.id} type="button" style={{ "--vc": vibe.color }} aria-pressed={vibe.id === value} disabled={busy} onClick={() => pick(vibe.id)}>
              <i aria-hidden="true" /> {vibe.label}
            </button>
          ))}
          {value && (
            <button type="button" className="vibe-clear" disabled={busy} onClick={() => pick(value)}>
              Tirar vibe
            </button>
          )}
        </div>
      )}
    </div>
  );
}
