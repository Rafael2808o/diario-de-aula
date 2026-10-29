// Fases da Lua — os oito moods de estudante. São metáforas descontraídas, não diagnóstico nem avaliação.
// "phase" vai de 0 (lua nova) a 1 (de volta à nova), usada para desenhar a lua de cada mood.
export const moods = [
  { id: "fantasma", phase: 0, name: "Estudante Fantasma", quote: "Presente na matrícula, ausente em espírito.", text: "Para os dias em que a faculdade parece distante e a vontade de interagir sumiu.", short: "modo fantasma" },
  { id: "amanha", phase: 0.125, name: "Estudante do Amanhã", quote: "Hoje não deu, mas amanhã eu viro outra pessoa.", text: "Para quem planeja começar, mas ainda não entrou no ritmo.", short: "amanhã eu começo" },
  { id: "focado", phase: 0.25, name: "Estudante Focado", quote: "Não me interrompe. Estou construindo meu futuro.", text: "Para os dias de foco e concentração.", short: "foco" },
  { id: "preguicoso", phase: 0.375, name: "Estudante Preguiçoso", quote: "Eu quero aprender, mas minha cama tem outros planos.", text: "Para quando a vontade de descansar está maior que a de estudar.", short: "recarga" },
  { id: "iluminado", phase: 0.5, name: "Estudante Iluminado", quote: "GENTE, EU ENTENDI A MATÉRIA!", text: "Para quando o conteúdo finalmente começa a fazer sentido.", short: "iluminação" },
  { id: "sobrevivente", phase: 0.625, name: "Estudante Sobrevivente", quote: "Não sei como, mas vou passar.", text: "Para os dias cansativos em que você continua tentando.", short: "sobrevivência" },
  { id: "ansioso", phase: 0.75, name: "Estudante Ansioso", quote: "Tem tanta coisa para fazer que eu não sei por onde começar.", text: "Para a sensação de pressão e de tarefas acumuladas.", short: "ansiedade" },
  { id: "era", phase: 0.875, name: "Estudante em sua Era Acadêmica", quote: "Esse semestre ninguém me segura.", text: "Para quem está motivado e decidido a aproveitar a vida acadêmica.", short: "era acadêmica" },
];
export const moodById = Object.fromEntries(moods.map((mood) => [mood.id, mood]));

// Categorias da Rádio das Estrelinhas (as mesmas do filtro e do servidor).
export const songCategories = ["Foco", "Preguiça", "Ansiedade pré-prova", "Motivação", "Relaxar", "Sobrevivência acadêmica"];

const shift = (iso, days) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
// Semana de segunda a domingo, igual à Constelação.
export const weekStartOf = (iso) => shift(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
export const shiftDay = shift;

const joinPt = (parts) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`);

// Resumo de um período a partir só dos registros que existem; dias sem registro são contados, nunca preenchidos.
export function periodSummary(records, from, to, today) {
  const last = to < today ? to : today;
  const inside = records.filter((record) => record.date >= from && record.date <= last);
  const counts = {};
  for (const record of inside) counts[record.mood] = (counts[record.mood] || 0) + 1;
  let total = 0;
  for (let day = from; day <= last; day = shift(day, 1)) total += 1;
  const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1] || moods.findIndex((mood) => mood.id === a[0]) - moods.findIndex((mood) => mood.id === b[0]));
  return { counts, ranked, registered: inside.length, missing: Math.max(0, total - inside.length), total };
}

export function weekMessage(summary) {
  if (!summary.registered) return "Nenhum mood registrado nesta semana ainda. Quando quiser, conte como está sua energia.";
  // "3 dias de foco, 2 de sobrevivência e 1 de recarga"
  const parts = summary.ranked.map(([id, count], index) => (index ? `${count} de ${moodById[id].short}` : `${count} ${count === 1 ? "dia" : "dias"} de ${moodById[id].short}`));
  const missing = summary.missing ? ` ${summary.missing === 1 ? "Um dia ficou" : `${summary.missing} dias ficaram`} sem registro.` : "";
  return `Sua semana teve ${joinPt(parts)}.${missing} Respeite seu ritmo, estrelinha.`;
}
