import { BookOpen, CalendarClock, ClipboardCheck, GraduationCap, Sparkles } from "lucide-react";
import { computeProgress } from "./progress.js";
import { htmlToText } from "./richtext.js";
import { addDays, classOccurrences, formatFull } from "./dates.js";

export const subjectPalette = ["#6f8cf6", "#9b7cf4", "#c084e8", "#5aa9d6", "#e07fa8", "#58b39a", "#e59a6b", "#7d8aa6"];

export const lessonStatus = {
  pendente: { label: "Ainda não registrado", short: "Pendente" },
  presente: { label: "Presente", short: "Presente" },
  falta: { label: "Faltei", short: "Falta" },
  cancelada: { label: "Aula cancelada", short: "Cancelada" },
};

// Cada tipo tem ícone e rótulo próprios, para que a cor da disciplina nunca seja a única pista.
export const itemKinds = {
  aula: { label: "Aula", icon: BookOpen },
  prova: { label: "Prova", icon: GraduationCap, highlight: true },
  entrega: { label: "Entrega", icon: ClipboardCheck, highlight: true },
  estudo: { label: "Sessão de estudo", icon: Sparkles },
  evento: { label: "Compromisso", icon: CalendarClock },
};

export const kindFilters = [
  ["aula", "Aulas"],
  ["prova", "Provas"],
  ["entrega", "Entregas"],
  ["estudo", "Estudo"],
  ["evento", "Compromissos"],
];

export const subjectById = (subjects, id) => subjects.find((subject) => subject.id === id) || null;

export function nextPaletteColor(subjects) {
  const used = new Set(subjects.map((subject) => subject.color));
  return subjectPalette.find((color) => !used.has(color)) || subjectPalette[subjects.length % subjectPalette.length];
}

// Junta aulas geradas pela grade, provas, prazos, eventos e planos antigos em uma lista única de itens de agenda.
export function agendaItems(data, user, from, to) {
  const { subjects, lessons, exams, tasks, events } = data;
  const items = classOccurrences(subjects, lessons, user, from, to).map((occurrence) => ({
    id: `aula-${occurrence.key}`,
    kind: "aula",
    date: occurrence.date,
    start: occurrence.start,
    end: occurrence.end,
    title: occurrence.subject.name,
    detail: occurrence.lesson?.theme || occurrence.room || "",
    subject: occurrence.subject,
    status: occurrence.lesson?.status || "pendente",
    occurrence,
  }));
  for (const exam of exams) {
    if (exam.date < from || exam.date > to) continue;
    items.push({ id: `prova-${exam.id}`, kind: "prova", date: exam.date, start: exam.time, title: exam.title, detail: exam.location, subject: subjectById(subjects, exam.subjectId), record: exam });
  }
  for (const task of tasks) {
    if (task.dueDate < from || task.dueDate > to) continue;
    items.push({ id: `entrega-${task.id}`, kind: "entrega", date: task.dueDate, start: task.dueTime, title: task.title, detail: task.kind, subject: subjectById(subjects, task.subjectId), done: task.done, record: task });
  }
  for (const event of events) {
    if (event.date < from || event.date > to) continue;
    items.push({
      id: `evento-${event.id}`,
      kind: event.kind === "Sessão de estudo" ? "estudo" : "evento",
      date: event.date,
      start: event.startTime,
      end: event.endTime,
      title: event.title,
      detail: event.kind,
      subject: subjectById(subjects, event.subjectId),
      record: event,
    });
  }
  for (const plan of data["study-plans"] || []) {
    if (!plan.date || plan.date < from || plan.date > to) continue;
    const subject = subjects.find((item) => item.name.toLowerCase() === plan.subject.toLowerCase()) || null;
    items.push({ id: `plano-${plan.id}`, kind: "estudo", date: plan.date, start: plan.time, title: plan.topic, detail: subject ? "" : plan.subject, subject, legacy: true, record: plan });
  }
  return items.sort((a, b) => `${a.date}${a.start || "99:99"}`.localeCompare(`${b.date}${b.start || "99:99"}`));
}

const normalize = (value) =>
  String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

function snippet(texts, term) {
  for (const text of texts) {
    const plain = String(text || "");
    const index = normalize(plain).indexOf(term);
    if (index < 0) continue;
    const start = Math.max(0, index - 40);
    return `${start ? "…" : ""}${plain.slice(start, index + term.length + 60).trim()}${index + term.length + 60 < plain.length ? "…" : ""}`;
  }
  return "";
}

export const searchTypes = [
  ["disciplina", "Disciplinas"],
  ["aula", "Aulas"],
  ["prova", "Provas"],
  ["atividade", "Atividades"],
  ["professor", "Cofre do professor"],
  ["material", "Materiais"],
];

// Busca sem acento e sem diferenciar maiúsculas em todos os textos que o estudante registrou.
export function searchAll(data, query, { subjectId = "", type = "" } = {}) {
  const term = normalize(query.trim());
  if (term.length < 2) return [];
  const { subjects } = data;
  const results = [];
  const push = (entry, texts) => {
    if (subjectId && entry.subjectId !== subjectId) return;
    if (type && entry.type !== type) return;
    const found = snippet(texts, term);
    if (found) results.push({ ...entry, subject: subjectById(subjects, entry.subjectId), snippet: found });
  };
  for (const subject of subjects) {
    push({ type: "disciplina", id: subject.id, subjectId: subject.id, title: subject.name, link: { page: "conteudos", id: subject.id } }, [subject.name, subject.professor]);
  }
  for (const lesson of data.lessons) {
    push(
      { type: "aula", id: lesson.id, subjectId: lesson.subjectId, title: lesson.theme || "Registro de aula", date: lesson.date, link: { page: "aulas", lesson: lesson.id } },
      [lesson.theme, lesson.expected, lesson.taught, lesson.notes, lesson.examInfo, lesson.missedContent, lesson.transcript],
    );
  }
  for (const exam of data.exams) {
    push(
      { type: "prova", id: exam.id, subjectId: exam.subjectId, title: exam.title, date: exam.date, link: { page: "provas", id: exam.id } },
      [exam.title, ...exam.topics.map((topic) => topic.title), exam.instructions, exam.format, exam.references, exam.personalNotes],
    );
  }
  for (const task of data.tasks) {
    push({ type: "atividade", id: task.id, subjectId: task.subjectId, title: task.title, date: task.dueDate, link: { page: "calendario", date: task.dueDate } }, [task.title, task.notes]);
  }
  for (const note of data["teacher-notes"]) {
    push(
      { type: "professor", id: note.id, subjectId: note.subjectId, title: note.category, date: note.informedOn, link: { page: "conteudos", id: note.subjectId, tab: "professor" } },
      [note.content, note.category],
    );
  }
  for (const material of data.materials) {
    push(
      { type: "material", id: material.id, subjectId: material.subjectId, title: material.title, link: { page: "conteudos", id: material.subjectId, tab: "materiais" } },
      [material.title, material.notes, material.url, material.subject],
    );
  }
  for (const diary of data.diaries || []) {
    const subject = subjects.find((item) => item.name.toLowerCase() === diary.subject.toLowerCase());
    push(
      { type: "aula", id: `diario-${diary.id}`, subjectId: subject?.id || "", title: `${diary.subject} (diário anterior)`, date: diary.date, link: { page: "aulas", date: diary.date } },
      [diary.subject, diary.planned, diary.actual, diary.reached, diary.understood, diary.doubts, diary.notes, diary.references],
    );
  }
  return results.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export const describeDate = (iso) => (iso ? formatFull(iso) : "Sem data");

// Conta o domínio por tópico com base no status que o próprio aluno marcou nas provas.
export function topicProgress(exams) {
  const counts = { "Não iniciado": 0, "Em estudo": 0, Revisado: 0, Dominado: 0 };
  for (const exam of exams) for (const topic of exam.topics) counts[topic.status] += 1;
  return counts;
}

// Aulas em que um tópico aparece, comparando texto sem acento. Serve para "aulas relacionadas" de uma prova.
export function lessonsMentioning(lessons, subjectId, term) {
  const needle = normalize(term);
  if (needle.length < 2) return [];
  return lessons.filter(
    (lesson) =>
      lesson.subjectId === subjectId &&
      [lesson.theme, lesson.expected, lesson.taught, lesson.notes, lesson.examInfo, lesson.missedContent, lesson.transcript].some((text) => normalize(text).includes(needle)),
  );
}

export const lessonHasContent = (lesson) => Boolean([lesson.theme, lesson.taught, lesson.notes, lesson.transcript, lesson.missedContent, htmlToText(lesson.annotations)].some((text) => String(text || "").trim()));

// Aulas que precisam de atenção, só a partir do que já aconteceu (nunca cria nem apaga registros).
// "vazia": aula da grade sem registro ou marcada como presente sem conteúdo. "revisar": rascunho.
// "perdida": falta sem o conteúdo perdido anotado. Aulas canceladas ficam de fora.
export function pendingLessons(data, user, today, now, days = 45) {
  const from = addDays(today, -days);
  return classOccurrences(data.subjects, data.lessons, user, from, today)
    .filter((occurrence) => occurrence.date < today || !occurrence.start || occurrence.start <= now)
    .flatMap((occurrence) => {
      const lesson = occurrence.lesson;
      if (lesson?.status === "cancelada") return [];
      let kind = "";
      if (!lesson || lesson.status === "pendente") kind = "vazia";
      else if (lesson.draft) kind = "revisar";
      else if (lesson.status === "presente" && !String(lesson.taught || "").trim() && !String(lesson.transcript || "").trim() && !htmlToText(lesson.annotations)) kind = "vazia";
      else if (lesson.status === "falta" && !lesson.recovered && !String(lesson.missedContent || "").trim()) kind = "perdida";
      return kind ? [{ ...occurrence, kind }] : [];
    })
    .sort((a, b) => `${b.date}${b.start}`.localeCompare(`${a.date}${a.start}`));
}

// Aulas que já aconteceram (presente) sem nenhum material anexado. As marcadas pela pessoa como
// "sem material disponibilizado" ficam fora da pendência e são contadas à parte: não ter arquivo do professor
// é diferente de ainda não ter anexado, e nenhuma das duas coisas diz se a aula tem conteúdo.
export function lessonsWithoutMaterial(data, today, days = 45) {
  const from = addDays(today, -days);
  const withMaterial = new Set(data.materials.map((material) => material.lessonId).filter(Boolean));
  const recent = data.lessons.filter((lesson) => lesson.status === "presente" && lesson.date >= from && lesson.date <= today && !withMaterial.has(lesson.id));
  return {
    missing: recent.filter((lesson) => !lesson.noMaterial).sort((a, b) => b.date.localeCompare(a.date)),
    marked: recent.filter((lesson) => lesson.noMaterial),
  };
}

// Aulas que alimentam a revisão de uma prova, sempre por referência ao registro original.
// Vínculo manual (lesson.examId) vale primeiro. Sem vínculo, entram as aulas da mesma disciplina
// depois da prova anterior dessa disciplina e até a data desta prova.
export function examLessons(data, exam) {
  const previous = data.exams
    .filter((other) => other.id !== exam.id && other.subjectId === exam.subjectId && other.date < exam.date)
    .reduce((latest, other) => (other.date > latest ? other.date : latest), "");
  return data.lessons
    .flatMap((lesson) => {
      if (lesson.examId === exam.id) return [{ lesson, origin: "vinculada" }];
      if (lesson.examId || lesson.subjectId !== exam.subjectId || lesson.status === "cancelada") return [];
      if (lesson.date > exam.date || (previous && lesson.date <= previous) || !lessonHasContent(lesson)) return [];
      return [{ lesson, origin: "periodo" }];
    })
    .sort((a, b) => a.lesson.date.localeCompare(b.lesson.date));
}

// XP, nível e relíquias do perfil, a partir das coleções carregadas no app.
export const progressOf = (data, today) => computeProgress({ ...data, studySessions: data["study-sessions"], quizResults: data["quiz-results"] }, today);

// Progresso de uma disciplina: aulas que já aconteceram com conteúdo registrado e assuntos de prova revisados.
// Aulas canceladas não contam. Sem grade nem assuntos, o progresso fica indefinido (null).
export function subjectProgress(data, user, subject, today) {
  const occurrences = classOccurrences([subject], data.lessons, user, "0000-01-01", today).filter((occurrence) => occurrence.lesson?.status !== "cancelada" && (occurrence.date < today || occurrence.lesson));
  // Mesmo critério das aulas pendentes do Início: presente com conteúdo, ou falta com o conteúdo perdido anotado.
  const filled = (text) => Boolean(String(text || "").trim());
  const registered = occurrences.filter(({ lesson }) => lesson && !lesson.draft && ((lesson.status === "presente" && (filled(lesson.taught) || filled(lesson.transcript) || filled(htmlToText(lesson.annotations)))) || (lesson.status === "falta" && (lesson.recovered || filled(lesson.missedContent))))).length;
  const topics = data.exams.filter((exam) => exam.subjectId === subject.id).flatMap((exam) => exam.topics);
  const topicsDone = topics.filter((topic) => topic.status === "Revisado" || topic.status === "Dominado").length;
  const total = occurrences.length + topics.length;
  return {
    percent: total ? Math.round(((registered + topicsDone) / total) * 100) : null,
    registered,
    occurred: occurrences.length,
    topicsDone,
    topics: topics.length,
    pending: occurrences.length - registered,
  };
}
