import { useEffect } from "react";
import { addDays, classOccurrences, nowTime, todayIso } from "./dates.js";

// Notificações do aparelho enquanto a Grimiau está aberta (aba, PWA ou app). Não há push do servidor:
// com o app fechado, nada é enviado, e a tela de Configurações diz isso.
const enabledKey = "lumina.notify";
const sentKey = "lumina.notify.sent";

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Sem armazenamento, o aviso pode se repetir nesta sessão.
  }
};

export const notificationsSupported = () => typeof window !== "undefined" && "Notification" in window;
export const notificationsEnabled = () => notificationsSupported() && Notification.permission === "granted" && read(enabledKey, "0") === "1";

export async function enableNotifications() {
  if (window.LUMINA_APP) throw new Error("No app Android, as notificações ainda não funcionam. Use o Lúmina pelo navegador ou instalado na tela inicial para recebê-las.");
  if (!notificationsSupported()) throw new Error("Este navegador não mostra notificações. No iPhone, instale a Grimiau na Tela de Início primeiro.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("A permissão foi negada. Libere as notificações do site nas configurações do navegador.");
  write(enabledKey, "1");
}

export const disableNotifications = () => write(enabledKey, "0");

async function show(title, body, tag) {
  const options = { body, tag, icon: "/icons/grimiau-192.png", badge: "/icons/grimiau-192.png" };
  const registration = await navigator.serviceWorker?.getRegistration?.();
  if (registration) return registration.showNotification(title, options);
  return new Notification(title, options);
}

const minutesOf = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export function dueNotifications(data, user, now = new Date()) {
  const today = todayIso(now);
  const current = minutesOf(nowTime(now));
  const prefs = user.preferences?.reminders || {};
  const list = [];
  if (prefs.classes !== false) {
    for (const item of classOccurrences(data.subjects, data.lessons, user, today, today)) {
      const end = item.end ? minutesOf(item.end) : null;
      // Lembra de registrar logo depois que a aula termina, se ainda não houver registro.
      if (end !== null && !item.lesson && current >= end && current <= end + 90) list.push({ tag: `aula-${item.key}`, title: "Você teve aula hoje?", body: `Registre o que aconteceu em ${item.subject.name}.` });
    }
  }
  for (const event of data.events) {
    if (!event.reminderMinutes || !event.startTime || event.date !== today || event.done) continue;
    const start = minutesOf(event.startTime);
    if (current >= start - event.reminderMinutes && current <= start) list.push({ tag: `evento-${event.id}`, title: event.kind === "Sessão de estudo" ? "Está na hora da sua sessão de estudos" : "Lembrete", body: `${event.title} às ${event.startTime}.` });
  }
  if (prefs.exams !== false) {
    for (const exam of data.exams) {
      if (exam.date === addDays(today, 1) || exam.date === addDays(today, 3)) list.push({ tag: `prova-${exam.id}-${today}`, title: "Sua prova está chegando", body: `${exam.title} é ${exam.date === addDays(today, 1) ? "amanhã" : "em 3 dias"}. Que tal começar a revisão?` });
    }
  }
  for (const task of data.tasks) {
    if (!task.done && task.dueDate === addDays(today, 1)) list.push({ tag: `tarefa-${task.id}`, title: "Há um trabalho com prazo próximo", body: `${task.title} vence amanhã.` });
  }
  return list;
}

export function useLocalNotifications(data, user) {
  useEffect(() => {
    if (!user) return undefined;
    const check = () => {
      if (!notificationsEnabled()) return;
      let sent = {};
      try {
        sent = JSON.parse(read(sentKey, "{}"));
      } catch {
        sent = {};
      }
      for (const item of dueNotifications(data, user)) {
        if (sent[item.tag]) continue;
        sent[item.tag] = Date.now();
        show(item.title, item.body, item.tag).catch(() => {});
      }
      // Guarda só a última semana para o registro não crescer sem limite.
      const weekAgo = Date.now() - 7 * 86_400_000;
      write(sentKey, JSON.stringify(Object.fromEntries(Object.entries(sent).filter(([, time]) => time > weekAgo))));
    };
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  }, [data, user]);
}
