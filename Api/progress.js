// Progresso da Grimiau: XP, nível, sequência e relíquias, sempre calculados a partir dos registros que já existem.
// Nada disso é gravado no banco: apagar ou editar um registro muda o resultado, e nenhum dado antigo é tocado.
// Este arquivo não importa nada: é o mesmo em Web/src/lib/progress.js e Api/progress.js (o teste confere que são iguais).

export const xpRules = {
  lesson: 20, // aula registrada com conteúdo
  missed: 10, // falta com o conteúdo perdido anotado
  minute: 1, // cada minuto salvo no Ritual
  review: 2, // cada revisão de carta
  quiz: 10, // cada simulado terminado
  correct: 3, // cada questão certa
  reviewed: 10, // assunto marcado como revisado
  mastered: 20, // assunto marcado como dominado
  task: 10, // atividade concluída
};

const filled = (text) => Boolean(String(text || "").trim());
// O caderno da aula é HTML: conta só se tiver texto de verdade, não apenas marcação vazia.
const annotated = (lesson) => filled(String(lesson.annotations || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " "));
const lessonDone = (lesson) => lesson.status === "presente" && !lesson.draft && ([lesson.taught, lesson.transcript, lesson.notes].some(filled) || annotated(lesson));
const missedDone = (lesson) => lesson.status === "falta" && (lesson.recovered || filled(lesson.missedContent));

// Nível L começa em 50·L·(L−1) XP: 0, 100, 300, 600, 1000, 1500...
export const levelStart = (level) => 50 * level * (level - 1);
export function levelFor(xp) {
  let level = 1;
  while (levelStart(level + 1) <= xp) level += 1;
  return level;
}

export const titles = [
  [1, "Aprendiz da Lua"],
  [3, "Estudante das Estrelas"],
  [5, "Sentinela do Grimório"],
  [8, "Guia das Constelações"],
  [12, "Lenda do Observatório"],
];
export const titleFor = (level) => titles.filter(([from]) => level >= from).pop()[1];

const shiftDay = (iso, days) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

// Dias com estudo: sessões do Ritual, aulas registradas, cartas revisadas e simulados feitos.
export function studyDays(data) {
  const days = new Set();
  for (const session of data.studySessions || []) if (session.date) days.add(session.date);
  for (const lesson of data.lessons || []) if (lessonDone(lesson) || missedDone(lesson)) days.add(lesson.date);
  for (const card of data.flashcards || []) if (card.reviewedOn) days.add(card.reviewedOn);
  for (const quiz of data.quizResults || []) if (quiz.takenOn) days.add(quiz.takenOn);
  return days;
}

function streaks(days, today) {
  // A sequência continua viva se o último dia de estudo foi hoje ou ontem.
  let current = 0;
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  while (days.has(cursor)) {
    current += 1;
    cursor = shiftDay(cursor, -1);
  }
  let best = 0;
  let run = 0;
  let previous = "";
  for (const day of [...days].sort()) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return { current, best };
}

const weekLetters = ["D", "S", "T", "Q", "Q", "S", "S"];
const weekNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export function computeProgress(data, today) {
  const lessons = data.lessons || [];
  const sessions = data.studySessions || [];
  const cards = data.flashcards || [];
  const quizzes = data.quizResults || [];
  const exams = data.exams || [];
  const tasks = data.tasks || [];
  const topics = exams.flatMap((exam) => exam.topics || []);

  const counts = {
    lessons: lessons.filter(lessonDone).length,
    missed: lessons.filter(missedDone).length,
    minutes: Math.floor(sessions.reduce((sum, session) => sum + (session.durationSeconds || 0), 0) / 60),
    reviews: cards.reduce((sum, card) => sum + (card.reviews || 0), 0),
    quizzes: quizzes.length,
    questions: quizzes.reduce((sum, quiz) => sum + (quiz.total || 0), 0),
    correct: quizzes.reduce((sum, quiz) => sum + (quiz.correct || 0), 0),
    reviewed: topics.filter((topic) => topic.status === "Revisado").length,
    mastered: topics.filter((topic) => topic.status === "Dominado").length,
    tasks: tasks.filter((task) => task.done).length,
    masteredCards: cards.filter((card) => card.level === "fácil").length,
    annotated: lessons.filter(annotated).length,
    moods: (data.moods || []).length,
    songs: (data.songs || []).length,
  };
  const xp =
    counts.lessons * xpRules.lesson +
    counts.missed * xpRules.missed +
    counts.minutes * xpRules.minute +
    counts.reviews * xpRules.review +
    counts.quizzes * xpRules.quiz +
    counts.correct * xpRules.correct +
    counts.reviewed * xpRules.reviewed +
    counts.mastered * xpRules.mastered +
    counts.tasks * xpRules.task;
  const level = levelFor(xp);
  const days = studyDays(data);
  const { current, best } = streaks(days, today);
  const lateSession = (session) => session.startTime && (session.startTime >= "22:00" || session.startTime < "04:00");
  const nightOwl = sessions.some(lateSession);
  const examDone = exams.some((exam) => (exam.topics || []).length >= 3 && exam.topics.every((topic) => topic.status === "Revisado" || topic.status === "Dominado"));

  // Data da conquista quando ela sai dos próprios registros (o primeiro registro que cumpriu a regra).
  // Sem data nos registros (provas, cartas, assuntos), fica vazia: o servidor guarda o dia em que percebeu a conquista.
  const firstDate = (dates) => dates.filter(Boolean).sort()[0] || "";
  const relic = (id, title, description, value, goal, unlockedOn = "") => ({ id, title, description, unlocked: value >= goal, value: Math.min(value, goal), goal, unlockedOn: value >= goal ? unlockedOn : "" });
  const achievements = [
    // Relíquias de começo: uma ação real de cada parte do app.
    relic("primeira-estrela", "Primeira Estrela", "Ganhe seu primeiro XP com uma ação de estudo.", xp > 0 ? 1 : 0, 1),
    relic("diario-aberto", "Diário Aberto", "Escreva no caderno de uma aula.", counts.annotated, 1, firstDate(lessons.filter(annotated).map((lesson) => lesson.date))),
    relic("comeco-magico", "Começo Mágico", "Revise uma Carta do Saber ou termine um simulado.", counts.reviews + counts.quizzes, 1, firstDate([...cards.filter((card) => card.reviews > 0).map((card) => card.reviewedOn), ...quizzes.map((quiz) => quiz.takenOn)])),
    relic("lunar", "Relíquia Lunar", "Registre seu primeiro mood em Fases da Lua.", counts.moods, 1, firstDate((data.moods || []).map((mood) => mood.date))),
    relic("musical", "Relíquia Musical", "Indique uma música válida na Rádio das Estrelinhas.", counts.songs, 1, firstDate((data.songs || []).map((song) => song.createdOn))),
    relic("primeira-aula", "Primeira aula", "Registre o conteúdo de uma aula.", counts.lessons, 1, firstDate(lessons.filter(lessonDone).map((lesson) => lesson.date))),
    relic("primeira-prova", "Primeira prova", "Cadastre uma avaliação no grimório.", exams.length, 1),
    relic("primeiro-ritual", "Primeiro ritual", "Salve uma sessão no Ritual de Foco.", sessions.length, 1, firstDate(sessions.map((session) => session.date))),
    relic("sete-dias", "7 dias de foco", "Estude sete dias seguidos.", best, 7),
    relic("grimorio", "Primeiro grimório concluído", "Revise todos os assuntos de uma prova (mínimo de 3).", examDone ? 1 : 0, 1),
    relic("cem-questoes", "100 questões", "Responda 100 questões em simulados.", counts.questions, 100),
    relic("cartas", "Dez cartas dominadas", "Marque dez cartas como “Dominei”.", counts.masteredCards, 10),
    relic("noturno", "Estudante noturno", "Faça um ritual depois das 22h.", nightOwl ? 1 : 0, 1, firstDate(sessions.filter(lateSession).map((session) => session.date))),
    relic("dez-horas", "Dez horas de foco", "Some dez horas salvas no Ritual.", counts.minutes, 600),
  ];

  const week = Array.from({ length: 7 }, (_, index) => {
    const date = shiftDay(today, index - 6);
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return { date, short: weekLetters[weekday], label: weekNames[weekday], active: days.has(date) };
  });

  return {
    xp,
    level,
    title: titleFor(level),
    levelFrom: levelStart(level),
    levelTo: levelStart(level + 1),
    streak: current,
    bestStreak: best,
    counts,
    achievements,
    unlocked: achievements.filter((item) => item.unlocked).length,
    week,
    history: xpHistory({ lessons, sessions, cards, quizzes, exams, tasks }),
  };
}

// Histórico de XP: cada ganho vem de um registro que existe hoje, pelas mesmas regras do total.
// A soma das linhas é sempre igual ao XP total (o teste confere). "date" é o dia do registro quando ele tem data;
// "dateKind" diz que data é essa. Revisões de cartas, assuntos e atividades não guardam o dia do ganho.
export function xpHistory({ lessons = [], sessions = [], cards = [], quizzes = [], exams = [], tasks = [] }) {
  const entries = [];
  const add = (entry) => entry.xp > 0 && entries.push({ date: "", dateKind: "", subjectId: "", ...entry });
  for (const lesson of lessons) {
    if (lessonDone(lesson)) add({ id: `aula-${lesson.id}`, kind: "aula", xp: xpRules.lesson, date: lesson.date, dateKind: "aula", subjectId: lesson.subjectId, text: lesson.theme ? `Aula registrada: ${lesson.theme}` : "Aula registrada" });
    else if (missedDone(lesson)) add({ id: `falta-${lesson.id}`, kind: "falta", xp: xpRules.missed, date: lesson.date, dateKind: "aula", subjectId: lesson.subjectId, text: "Conteúdo de falta anotado" });
  }
  // Minutos: o total usa a soma de todas as sessões; cada sessão recebe os minutos inteiros dela
  // e os segundos que sobram de várias sessões viram uma linha própria, para a conta fechar.
  let sessionMinutes = 0;
  for (const session of sessions) {
    const minutes = Math.floor((session.durationSeconds || 0) / 60);
    sessionMinutes += minutes;
    add({ id: `ritual-${session.id}`, kind: "ritual", xp: minutes * xpRules.minute, date: session.date, dateKind: "sessao", subjectId: session.subjectId || "", text: `Ritual de Foco: ${minutes} min` });
  }
  const leftover = Math.floor(sessions.reduce((sum, session) => sum + (session.durationSeconds || 0), 0) / 60) - sessionMinutes;
  add({ id: "ritual-sobra", kind: "ritual", xp: leftover * xpRules.minute, text: "Segundos somados de várias sessões do Ritual" });
  for (const quiz of quizzes) add({ id: `simulado-${quiz.id}`, kind: "simulado", xp: xpRules.quiz + (quiz.correct || 0) * xpRules.correct, date: quiz.takenOn, dateKind: "simulado", subjectId: quiz.subjectId, text: `Simulado${quiz.topic ? ` de ${quiz.topic}` : ""}: ${quiz.correct || 0} de ${quiz.total || 0} certas` });
  for (const card of cards) add({ id: `carta-${card.id}`, kind: "carta", xp: (card.reviews || 0) * xpRules.review, date: card.reviewedOn || "", dateKind: card.reviewedOn ? "ultima-revisao" : "", subjectId: card.subjectId, text: `${card.reviews} ${card.reviews === 1 ? "revisão" : "revisões"} da carta “${card.front}”` });
  for (const exam of exams) {
    for (const topic of exam.topics || []) {
      if (topic.status === "Revisado") add({ id: `assunto-${exam.id}-${topic.id}`, kind: "assunto", xp: xpRules.reviewed, subjectId: exam.subjectId, text: `Assunto revisado: ${topic.title} (${exam.title})` });
      if (topic.status === "Dominado") add({ id: `assunto-${exam.id}-${topic.id}`, kind: "assunto", xp: xpRules.mastered, subjectId: exam.subjectId, text: `Assunto dominado: ${topic.title} (${exam.title})` });
    }
  }
  for (const task of tasks) if (task.done) add({ id: `atividade-${task.id}`, kind: "atividade", xp: xpRules.task, subjectId: task.subjectId || "", text: `Atividade concluída: ${task.title}` });
  return entries.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.id.localeCompare(b.id));
}
