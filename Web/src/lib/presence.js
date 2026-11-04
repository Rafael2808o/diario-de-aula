import { useEffect } from "react";
import { apiBase } from "./api.js";

// Sinal de presença para a lista de membros da Comunidade.
// Só conta como atividade a aba visível com toque, clique, tecla ou rolagem nos últimos 5 minutos:
// deixar o app aberto e parado não mantém ninguém "online". Ao fechar a aba ou sair da conta, avisa a saída;
// trocar de app ou de aba só para os sinais, e o status expira pela tolerância do servidor (sem piscar).
const beatEvery = 60_000;
const idleAfter = 5 * 60_000;

export function usePresence(token) {
  useEffect(() => {
    if (!token) return undefined;
    let lastInput = Date.now();
    let lastBeat = 0;
    const send = (path) =>
      fetch(`${apiBase}/presence/${path}`, { method: "POST", keepalive: true, headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    const beat = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastInput > idleAfter) return;
      lastBeat = Date.now();
      send("heartbeat");
    };
    const onInput = () => {
      const wasIdle = Date.now() - lastInput > idleAfter;
      lastInput = Date.now();
      // Voltou a mexer depois de um tempo parado: aparece online sem esperar o próximo ciclo.
      if (wasIdle || Date.now() - lastBeat > beatEvery) beat();
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return undefined;
      lastInput = Date.now();
      return beat();
    };
    const onLeave = () => send("leave");
    const events = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((name) => window.addEventListener(name, onInput, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);
    beat();
    const timer = setInterval(beat, beatEvery);
    return () => {
      clearInterval(timer);
      events.forEach((name) => window.removeEventListener(name, onInput));
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [token]);
}

export const leavePresence = (token) =>
  fetch(`${apiBase}/presence/leave`, { method: "POST", keepalive: true, headers: { Authorization: `Bearer ${token}` } }).catch(() => {});

// "Online agora", "Visto por último há 5 minutos", "hoje às 14h30", "ontem", "em 12/10".
export function lastSeenLabel(member, now = Date.now()) {
  if (member.online) return "Online agora";
  const seen = new Date(member.lastSeenAt);
  const minutes = Math.max(1, Math.round((now - seen.getTime()) / 60_000));
  if (minutes < 60) return `Visto por último há ${minutes} ${minutes === 1 ? "minuto" : "minutos"}`;
  const day = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(date);
  const today = day(new Date(now));
  const yesterday = day(new Date(now - 86_400_000));
  const hour = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(seen).replace(":", "h");
  if (day(seen) === today) return `Visto por último hoje às ${hour}`;
  if (day(seen) === yesterday) return "Visto por último ontem";
  return `Visto por último em ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(seen)}`;
}
