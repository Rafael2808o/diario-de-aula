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
const lessonDone = (lesson) => lesson.status === "presente" && !lesson.draft && [lesson.taught, lesson.transcript, lesson.notes].some(filled);
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
  const nightOwl = sessions.some((session) => session.startTime && (session.startTime >= "22:00" || session.startTime < "04:00"));
  const examDone = exams.some((exam) => (exam.topics || []).length >= 3 && exam.topics.every((topic) => topic.status === "Revisado" || topic.status === "Dominado"));

  const relic = (id, title, description, value, goal) => ({ id, title, description, unlocked: value >= goal, value: Math.min(value, goal), goal });
  const achievements = [
    relic("primeira-aula", "Primeira aula", "Registre o conteúdo de uma aula.", counts.lessons, 1),
    relic("primeira-prova", "Primeira prova", "Cadastre uma avaliação no grimório.", exams.length, 1),
    relic("primeiro-ritual", "Primeiro ritual", "Salve uma sessão no Ritual de Foco.", sessions.length, 1),
    relic("sete-dias", "7 dias de foco", "Estude sete dias seguidos.", best, 7),
    relic("grimorio", "Primeiro grimório concluído", "Revise todos os assuntos de uma prova (mínimo de 3).", examDone ? 1 : 0, 1),
    relic("cem-questoes", "100 questões", "Responda 100 questões em simulados.", counts.questions, 100),
    relic("cartas", "Dez cartas dominadas", "Marque dez cartas como “Dominei”.", counts.masteredCards, 10),
    relic("noturno", "Estudante noturno", "Faça um ritual depois das 22h.", nightOwl ? 1 : 0, 1),
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
  };
}
