import { useCallback, useEffect, useState } from "react";
import { nowTime, todayIso } from "./dates.js";

// Ritual de Concentração: o tempo é calculado por intervalos válidos (início do trecho atual + tempo acumulado),
// nunca somando um contador a cada segundo. Só conta o tempo com o Grimiau aberto e visível:
// - ao esconder a aba, bloquear a tela, trocar de app ou sair da página, a sessão pausa e guarda o tempo na hora;
// - enquanto roda, grava um ponto de controle a cada poucos segundos (checkpointAt);
// - se o app foi encerrado sem aviso (sistema matou o processo), ao abrir de novo a sessão volta pausada
//   com o tempo só até o último ponto de controle. O período fechado nunca vira tempo de estudo.
// A visibilidade do painel é outro estado, independente.
const sessionKey = "grimiau.ritual";
const viewKey = "grimiau.ritual.view";

const idle = { status: "idle" };
const checkpointEveryMs = 5_000;
// Sem ponto de controle há mais que isto, a sessão "rodando" salva é de um app que foi encerrado.
export const staleAfterMs = 20_000;

// Sessão que estava rodando num app que parou sem aviso: fecha o trecho no último ponto de controle e pausa.
export function recover(state, now = Date.now()) {
  if (state?.status !== "running") return state;
  const lastAlive = Math.max(state.segmentStart, state.checkpointAt || state.segmentStart);
  if (now - lastAlive <= staleAfterMs) return state;
  return { ...state, status: "paused", accumulatedMs: state.accumulatedMs + Math.max(0, lastAlive - state.segmentStart), autoPaused: "closed" };
}

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

// Meta do pomodoro escolhida por último neste aparelho (25 min na primeira vez).
export const ritualGoals = [25, 50, 0];
const goalKey = "grimiau.ritual.meta";
export function readGoal() {
  try {
    const saved = localStorage.getItem(goalKey);
    return saved !== null && ritualGoals.includes(Number(saved)) ? Number(saved) : 25;
  } catch {
    return 25;
  }
}
export function saveGoal(value) {
  try {
    localStorage.setItem(goalKey, String(value));
  } catch {
    // Sem armazenamento, a meta escolhida vale só agora.
  }
}

// Relógio do ritual: mm:ss abaixo de uma hora, como num pomodoro; acima disso, com as horas.
export const formatTimer = (ms) => (ms >= 3_600_000 ? formatClock(ms) : formatClock(ms).slice(3));

export function formatDuration(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return "menos de 1 min";
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}` : `${minutes} min`;
}

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

export function useRitual() {
  const [state, setState] = useState(() => {
    const saved = read(sessionKey, idle);
    const fixed = recover(saved);
    if (fixed !== saved) write(sessionKey, fixed);
    return fixed;
  });
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

  // Ciclo de vida: pausa ao sair de vista, grava pontos de controle enquanto roda e confere ao voltar.
  useEffect(() => {
    const autoPause = (reason) => {
      const current = read(sessionKey, idle);
      if (current.status !== "running") return;
      const now = Date.now();
      commit({ ...current, status: "paused", accumulatedMs: elapsedMs(current, now), checkpointAt: now, autoPaused: reason });
    };
    const checkpoint = () => {
      const current = read(sessionKey, idle);
      if (current.status !== "running" || document.visibilityState !== "visible") return;
      // Se o próprio intervalo atrasou demais (aparelho dormiu sem avisar), trata como encerrado.
      const fixed = recover(current);
      if (fixed !== current) return commit(fixed);
      write(sessionKey, { ...current, checkpointAt: Date.now() });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") autoPause("hidden");
      else {
        const current = read(sessionKey, idle);
        const fixed = recover(current);
        if (fixed !== current) commit(fixed);
      }
    };
    const onLeave = () => autoPause("left");
    const onNativeBackground = () => autoPause("hidden");
    checkpoint();
    const timer = setInterval(checkpoint, checkpointEveryMs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("freeze", onLeave);
    // O app Android avisa quando vai para segundo plano (Mobile/App.js).
    window.addEventListener("grimiau:background", onNativeBackground);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
      document.removeEventListener("freeze", onLeave);
      window.removeEventListener("grimiau:background", onNativeBackground);
    };
  }, [commit]);

  const setView = useCallback((next) => {
    write(viewKey, next);
    setViewState(next);
  }, []);

  const start = useCallback(
    (subjectId = "", goalMinutes = readGoal()) => {
      const now = Date.now();
      // goalMs é a meta do pomodoro (0 = tempo livre). Só muda o que o relógio mostra; o tempo salvo é sempre o real.
      commit({ status: "running", id: newId(), startedAt: now, date: todayIso(), startTime: nowTime(), segmentStart: now, checkpointAt: now, accumulatedMs: 0, subjectId, goalMs: goalMinutes * 60_000 });
    },
    [commit],
  );
  const pause = useCallback(() => {
    const current = read(sessionKey, idle);
    if (current.status !== "running") return;
    commit({ ...current, status: "paused", accumulatedMs: elapsedMs(current), autoPaused: "" });
  }, [commit]);
  const resume = useCallback(() => {
    const current = read(sessionKey, idle);
    if (current.status !== "paused") return;
    const now = Date.now();
    commit({ ...current, status: "running", segmentStart: now, checkpointAt: now, autoPaused: "" });
  }, [commit]);
  const finish = useCallback(() => {
    const current = recover(read(sessionKey, idle));
    if (current.status !== "running" && current.status !== "paused") return;
    commit({ ...current, status: "finished", accumulatedMs: elapsedMs(current), autoPaused: "" });
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
