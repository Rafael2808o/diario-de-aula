import { useCallback, useEffect, useState } from "react";
import { nowTime, todayIso } from "./dates.js";

// Ritual de Concentração: o tempo é calculado por carimbos de relógio (início do trecho atual + tempo acumulado),
// nunca somando um contador a cada segundo. Por isso ele continua certo mesmo quando o navegador congela a página:
// - trocar de página no Grimiau não mexe na sessão (ela vive no Shell e no localStorage, não no painel);
// - esconder a aba, bloquear a tela ou trocar de app NÃO pausa: ao voltar, o relógio recalcula pelo horário
//   (o sistema pode suspender a página, mas o tempo real continua sendo contado pelos carimbos);
// - enquanto a página está visível, grava um ponto de controle a cada poucos segundos (checkpointAt);
// - se a pessoa volta depois de muito tempo sem nenhum sinal (mais de 2 h), a sessão fica pausada no último sinal e
//   o painel pergunta se o tempo fora conta ou não. O Grimiau nunca decide isso sozinho.
// O navegador não toca aviso com a página suspensa; a meta cumprida aparece quando a pessoa volta.
// A visibilidade do painel é outro estado, independente.
const sessionKey = "grimiau.ritual";
const viewKey = "grimiau.ritual.view";

const idle = { status: "idle" };
const checkpointEveryMs = 5_000;
// Sem nenhum sinal há mais que isto, pergunta antes de contar o tempo fora.
export const staleAfterMs = 2 * 3600_000;

// Sessão que ficou sem sinal por muito tempo: pausa no último sinal e guarda quanto tempo ficou fora (awayMs).
export function recover(state, now = Date.now()) {
  if (state?.status !== "running") return state;
  const lastAlive = Math.max(state.segmentStart, state.checkpointAt || state.segmentStart);
  if (now - lastAlive <= staleAfterMs) return state;
  return { ...state, status: "paused", accumulatedMs: state.accumulatedMs + Math.max(0, lastAlive - state.segmentStart), autoPaused: "away", awayMs: now - lastAlive };
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
    // Voltou depois de muito tempo sem sinal: abre o painel para a pergunta sobre o tempo fora.
    if (read(sessionKey, idle).autoPaused === "away") return "open";
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

  // Ciclo de vida: grava pontos de controle enquanto visível e confere a sessão ao voltar. Nunca pausa sozinho.
  useEffect(() => {
    const checkpoint = () => {
      const current = read(sessionKey, idle);
      if (current.status !== "running" || document.visibilityState !== "visible") return;
      const fixed = recover(current);
      if (fixed !== current) return commit(fixed);
      write(sessionKey, { ...current, checkpointAt: Date.now() });
    };
    const onVisibility = () => {
      const current = read(sessionKey, idle);
      if (document.visibilityState === "hidden") {
        // Último sinal antes de sumir: a contagem segue pelos carimbos.
        if (current.status === "running") write(sessionKey, { ...current, checkpointAt: Date.now() });
        return;
      }
      const fixed = recover(current);
      if (fixed !== current) {
        commit(fixed);
        write(viewKey, "open");
        setViewState("open");
      } else setState(current);
    };
    checkpoint();
    const timer = setInterval(checkpoint, checkpointEveryMs);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pageshow", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    };
  }, [commit]);

  const setView = useCallback((next) => {
    write(viewKey, next);
    setViewState(next);
  }, []);

  const start = useCallback(
    (subjectId = "", goalMinutes = readGoal(), { topic = "", topicRef = "" } = {}) => {
      const now = Date.now();
      // goalMs é a meta do pomodoro (0 = tempo livre). Só muda o que o relógio mostra; o tempo salvo é sempre o real.
      commit({ status: "running", id: newId(), startedAt: now, date: todayIso(), startTime: nowTime(), segmentStart: now, checkpointAt: now, accumulatedMs: 0, subjectId, goalMs: goalMinutes * 60_000, topic, topicRef });
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
    commit({ ...current, status: "running", segmentStart: now, checkpointAt: now, autoPaused: "", awayMs: 0 });
  }, [commit]);
  // Depois de muito tempo sem sinal: a pessoa escolhe se o tempo fora conta.
  const settleAway = useCallback(
    (count) => {
      const current = read(sessionKey, idle);
      if (current.status !== "paused" || current.autoPaused !== "away") return;
      const now = Date.now();
      commit({ ...current, status: "running", accumulatedMs: current.accumulatedMs + (count ? current.awayMs || 0 : 0), segmentStart: now, checkpointAt: now, autoPaused: "", awayMs: 0 });
    },
    [commit],
  );
  const finish = useCallback(() => {
    const current = recover(read(sessionKey, idle));
    if (current.status !== "running" && current.status !== "paused") return;
    commit({ ...current, status: "finished", accumulatedMs: elapsedMs(current), autoPaused: "" });
  }, [commit]);
  const setSubject = useCallback(
    (subjectId) => {
      const current = read(sessionKey, idle);
      // Trocar a disciplina desfaz o conteúdo sugerido, que era de outra matéria.
      if (current.status !== "idle") commit({ ...current, subjectId, ...(subjectId !== current.subjectId ? { topic: "", topicRef: "" } : {}) });
    },
    [commit],
  );
  const reset = useCallback(() => commit(idle), [commit]);

  return { state, view, setView, start, pause, resume, finish, setSubject, reset, settleAway };
}
