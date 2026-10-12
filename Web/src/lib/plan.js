import { addDays, daysBetween, nowTime, todayIso, weekdayOf } from "./dates.js";
import { lessonsMentioning } from "./domain.js";

const toMinutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const toTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const priority = { "Não iniciado": 0, "Em estudo": 1, Revisado: 2, Dominado: 3 };

// Monta um cronograma realista até a véspera da prova com os minutos e horários que o aluno informou.
// Cada assunto pendente ganha uma sessão de estudo e, se houver dias, uma revisão espaçada; a véspera fica para a revisão final.
// Não usa IA: as escolhas são explicáveis e o aluno revisa tudo antes de salvar no calendário.
export function buildStudyPlan({ exam, lessons, user, today = todayIso() }) {
  const minutesPerDay = user.preferences?.studyMinutes || 0;
  const usedMinutes = minutesPerDay || 60;
  const slots = user.preferences?.studySlots || [];
  const pending = exam.topics
    .filter((topic) => topic.status !== "Dominado")
    .map((topic) => {
      const related = lessonsMentioning(lessons, exam.subjectId, topic.title);
      const mastery = related.filter((lesson) => lesson.mastery).map((lesson) => lesson.mastery);
      return { ...topic, related, mastery: mastery.length ? Math.min(...mastery) : 3 };
    })
    .sort((a, b) => priority[a.status] - priority[b.status] || a.mastery - b.mastery);

  const startDay = nowTime() > "20:00" ? addDays(today, 1) : today;
  const lastDay = addDays(exam.date, -1);
  const days = [];
  for (let day = startDay; day <= lastDay; day = addDays(day, 1)) {
    const daySlots = slots.filter((slot) => slot.day === weekdayOf(day));
    if (slots.length && !daySlots.length) continue;
    const start = daySlots[0]?.start || "";
    const end = daySlots[0]?.end || "";
    // A sessão cabe na janela informada para o dia; sem janela, usa os minutos diários.
    days.push({ day, start, end, window: start && end ? Math.min(usedMinutes, toMinutes(end) - toMinutes(start)) : usedMinutes });
  }

  const warnings = [];
  if (!minutesPerDay) warnings.push("Você não informou quantos minutos tem por dia; o plano usa 60 minutos. Ajuste em Configurações.");
  if (!slots.length) warnings.push("Sem horários de estudo definidos, as sessões ficam sem hora marcada.");
  if (!exam.topics.length) return { sessions: [], dropped: [], warnings: ["A prova ainda não tem assuntos. Informe o que o professor confirmou para montar o plano."], enough: false };
  if (!pending.length) return { sessions: [], dropped: [], warnings: ["Todos os assuntos estão marcados como dominados. Use a revisão final da prova."], enough: true };
  if (!days.length) return { sessions: [], dropped: pending, warnings: ["Não há dias de estudo disponíveis antes da prova. Revise primeiro: " + pending.slice(0, 3).map((topic) => topic.title).join(", ") + "."], enough: false };

  // Reserva a véspera para revisão final quando há pelo menos dois dias.
  const finalDay = days.length >= 2 ? days.pop() : null;
  const capacity = days.reduce((sum, day) => sum + Math.max(1, Math.floor(day.window / 30)), 0);
  const fitting = pending.slice(0, Math.max(1, capacity));
  const dropped = pending.slice(fitting.length);
  const queue = fitting.map((topic) => ({ topic, step: topic.status === "Revisado" ? "Revisar" : "Estudar" }));
  // Revisão espaçada só se sobrar capacidade depois de cobrir todos os assuntos.
  if (capacity > fitting.length * 1.5) fitting.filter((topic) => topic.status !== "Revisado").forEach((topic) => queue.push({ topic, step: "Praticar" }));

  const perDay = Math.max(1, Math.ceil(queue.length / days.length));
  const sessions = [];
  days.forEach(({ day, start, window }, index) => {
    const items = queue.slice(index * perDay, (index + 1) * perDay);
    if (!items.length) return;
    sessions.push({
      date: day,
      startTime: start,
      endTime: start ? toTime(toMinutes(start) + window) : "",
      minutes: window,
      title: items.map((item) => `${item.step}: ${item.topic.title}`).join(" + "),
      notes: items
        .map((item) => `${item.step} ${item.topic.title}${item.topic.related.length ? ` (aulas de ${item.topic.related.map((lesson) => lesson.date.split("-").reverse().slice(0, 2).join("/")).join(", ")})` : " (nenhuma aula registrada cita este assunto)"}`)
        .join("\n"),
    });
  });
  if (finalDay) {
    sessions.push({
      date: finalDay.day,
      startTime: finalDay.start,
      endTime: finalDay.start ? toTime(toMinutes(finalDay.start) + finalDay.window) : "",
      minutes: finalDay.window,
      title: `Revisão final: ${exam.title}`,
      notes: "Revise os pontos pendentes da prova e refaça as questões que errou.",
    });
  }
  const enough = dropped.length === 0 && daysBetween(today, exam.date) >= 1;
  if (dropped.length) warnings.unshift(`O tempo não cobre todos os assuntos. Ficaram de fora: ${dropped.map((topic) => topic.title).join(", ")}. Priorizamos os que você marcou como não iniciados e os de menor domínio.`);
  return { sessions, dropped, warnings, enough };
}
