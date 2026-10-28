import { useCallback, useEffect, useState } from "react";
import { nowTime, todayIso } from "./dates.js";

// Ritual de Concentração: o tempo é calculado por carimbos (início de cada trecho + tempo acumulado),
// nunca somando um contador a cada segundo. Assim ele continua certo com a aba em segundo plano,
// ao trocar de página ou depois de recarregar. A visibilidade do painel é outro estado, independente.
const sessionKey = "grimiau.ritual";
const viewKey = "grimiau.ritual.view";

const idle = { status: "idle" };

function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sem armazenamento, a sessão continua só nesta aba.
  }
}

export const elapsedMs = (state, now = Date.now()) =>
  state.status === "idle" ? 0 : state.accumulatedMs + (state.status === "running" ? Math.max(0, now - state.segmentStart) : 0);

export function formatClock(ms) {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "menos de 1 min";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function useRitual() {
  const [state, setState] = useState(() => read(sessionKey, idle));
  const [view, setViewState] = useState(() => {
    const saved = read(viewKey, "closed");
    return ["open", "minimized", "closed"].includes(saved) ? saved : "closed";
  });

  // Outra aba mexeu na sessão: acompanha sem recontar nada.
  useEffect(() => {
    const sync = (event) => {
      if (event.key === sessionKey) setState(read(sessionKey, idle));
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  const commit = useCallback((next) => {
    write(sessionKey, next);
    setState(next);
  }, []);

  const setView = useCallback((next) => {
    write(viewKey, next);
    setViewState(next);
  }, []);

  const start = useCallback(
    (subjectId = "") => {
      const now = Date.now();
      commit({ status: "running", id: newId(), startedAt: now, date: todayIso(), startTime: nowTime(), segmentStart: now, accumulatedMs: 0, subjectId });
    },
    [commit],
  );
  const pause = useCallback(() => {
    const current = read(sessionKey, idle);
    if (current.status !== "running") return;
    commit({ ...current, status: "paused", accumulatedMs: elapsedMs(current) });
  }, [commit]);
  const resume = useCallback(() => {
    const current = read(sessionKey, idle);
    if (current.status !== "paused") return;
    commit({ ...current, status: "running", segmentStart: Date.now() });
  }, [commit]);
  const finish = useCallback(() => {
    const current = read(sessionKey, idle);
    if (current.status !== "running" && current.status !== "paused") return;
    commit({ ...current, status: "finished", accumulatedMs: elapsedMs(current) });
  }, [commit]);
  const setSubject = useCallback(
    (subjectId) => {
      const current = read(sessionKey, idle);
      if (current.status !== "idle") commit({ ...current, subjectId });
    },
    [commit],
  );
  const reset = useCallback(() => commit(idle), [commit]);

  return { state, view, setView, start, pause, resume, finish, setSubject, reset };
}
