// Datas acadêmicas trafegam como texto "AAAA-MM-DD" e horários como "HH:MM". Os cálculos usam meio-dia UTC
// para que o dia da semana nunca mude por causa de fuso ou horário de verão.

export const timeZone = "America/Sao_Paulo";
export const weekdays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
export const weekdayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const pad = (value) => String(value).padStart(2, "0");
const parts = (date) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );

export function todayIso(now = new Date()) {
  const { year, month, day } = parts(now);
  return `${year}-${month}-${day}`;
}

export function nowTime(now = new Date()) {
  const { hour, minute } = parts(now);
  return `${hour}:${minute}`;
}

export const toDate = (iso) => new Date(`${iso}T12:00:00Z`);
export const fromDate = (date) =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
export const weekdayOf = (iso) => weekdays[toDate(iso).getUTCDay()];

export function addDays(iso, amount) {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + amount);
  return fromDate(date);
}

export function addMonths(iso, amount) {
  const date = toDate(iso);
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return fromDate(date);
}

export const startOfWeek = (iso) => addDays(iso, -toDate(iso).getUTCDay());
export const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;
export const endOfMonth = (iso) => addDays(addMonths(startOfMonth(iso), 1), -1);

export function daysBetween(from, to) {
  return Math.round((toDate(to) - toDate(from)) / 86_400_000);
}

export function range(from, to) {
  const days = [];
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day);
  return days;
}

const formatter = (options) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...options });
const shortFormat = formatter({ day: "2-digit", month: "2-digit" });
const longFormat = formatter({ weekday: "long", day: "numeric", month: "long" });
const fullFormat = formatter({ day: "2-digit", month: "2-digit", year: "numeric" });
const monthFormat = formatter({ month: "long", year: "numeric" });

export const formatShort = (iso) => (iso ? shortFormat.format(toDate(iso)) : "");
export const formatFull = (iso) => (iso ? fullFormat.format(toDate(iso)) : "");
export const formatLong = (iso) => (iso ? capitalize(longFormat.format(toDate(iso))) : "");
export const formatMonth = (iso) => capitalize(monthFormat.format(toDate(iso)));
export const formatTermMonth = (month) =>
  month ? capitalize(formatter({ month: "short", year: "numeric" }).format(toDate(`${month}-01`))) : "";
export const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);

export function countdown(iso, today = todayIso()) {
  const days = daysBetween(today, iso);
  if (days < 0) return days === -1 ? "ontem" : `há ${-days} dias`;
  if (days === 0) return "hoje";
  if (days === 1) return "amanhã";
  return `em ${days} dias`;
}

// Período em que as aulas recorrentes de uma disciplina acontecem: datas da própria disciplina,
// senão os meses do semestre letivo do perfil. Sem nenhuma das duas, não há como gerar ocorrências.
export function subjectPeriod(subject, user) {
  const start = subject.startDate || (user?.termStart ? `${user.termStart}-01` : "");
  const end = subject.endDate || (user?.termEnd ? endOfMonth(`${user.termEnd}-01`) : "");
  return { start, end };
}

export const occurrenceKey = (subjectId, date, start) => `${subjectId}|${date}|${start || ""}`;

// Gera as ocorrências de aula entre from e to e junta o registro salvo de cada uma, quando existe.
export function classOccurrences(subjects, lessons, user, from, to) {
  const saved = new Map(lessons.map((lesson) => [occurrenceKey(lesson.subjectId, lesson.date, lesson.startTime), lesson]));
  const result = [];
  for (const subject of subjects) {
    const period = subjectPeriod(subject, user);
    if (!period.start || !period.end || !subject.schedule?.length) continue;
    const first = from > period.start ? from : period.start;
    const last = to < period.end ? to : period.end;
    for (const day of first <= last ? range(first, last) : []) {
      const weekday = weekdayOf(day);
      for (const slot of subject.schedule) {
        if (slot.day !== weekday) continue;
        const key = occurrenceKey(subject.id, day, slot.start);
        result.push({ key, subject, date: day, start: slot.start, end: slot.end, room: slot.room, lesson: saved.get(key) || null });
        saved.delete(key);
      }
    }
  }
  // Registros fora da grade (aula extra, horário alterado) continuam visíveis.
  for (const lesson of saved.values()) {
    if (lesson.date < from || lesson.date > to) continue;
    const subject = subjects.find((item) => item.id === lesson.subjectId);
    if (subject) result.push({ key: occurrenceKey(subject.id, lesson.date, lesson.startTime), subject, date: lesson.date, start: lesson.startTime, end: "", room: "", lesson, extra: true });
  }
  return result.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

export const monthShort = (iso) => formatter({ month: "short" }).format(toDate(iso)).replace(".", "");
