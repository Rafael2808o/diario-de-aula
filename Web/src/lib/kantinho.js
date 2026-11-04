// Kantinho, o duende fotógrafo do Feed dos Migles. A imagem é sempre a referência oficial
// (public/kantinho), sem redesenho: as "poses" são só movimento e efeitos ao redor (veja .kantinho no CSS).
export const kantinhoImage = "/kantinho/kantinho.webp";
export const kantinhoSmall = "/kantinho/kantinho-240.webp";

// Uma sugestão por dia, igual para todo mundo (data de São Paulo). São faíscas de criatividade, não tarefas.
export const inspirations = [
  "Sua mesa de estudos do jeitinho que ela está agora, sem arrumar nada.",
  "Uma página do caderno com a sua letra mais caprichada.",
  "A caneca (ou garrafinha) que te acompanha nas horas de estudo.",
  "Um marca-texto em ação: mostre a frase mais importante de hoje.",
  "A vista da janela mais perto de onde você estuda.",
  "Seu estojo aberto, como um baú de ferramentas mágicas.",
  "Um livro ou apostila com a luz batendo de lado.",
  "O quadro da aula de hoje, antes de o professor apagar.",
  "Seus fones e a playlist que mais te ajuda a focar.",
  "Uma pilha de livros, do maior para o menor.",
  "O primeiro raio de sol (ou a primeira estrela) do seu dia de estudo.",
  "Um post-it com o lembrete mais importante da semana.",
  "Seus pés no chão do lugar onde você mais estuda.",
  "O mapa mental ou esquema que você fez por último.",
  "A tela do seu cronômetro de foco no meio de um Ritual.",
  "Uma planta, um bichinho ou qualquer coisa viva que estuda com você.",
  "As cores do seu material: junte tudo da mesma cor numa foto só.",
  "Um detalhe bem de perto: a ponta do lápis, uma letra, um clipe.",
  "O caminho até a aula: uma rua, um corredor, uma escada.",
  "O lanche oficial dos seus estudos.",
  "Sua agenda ou planner aberto na semana atual.",
  "Uma sombra interessante no seu espaço de estudo.",
  "A capa do livro que você está lendo agora.",
  "Uma frase que te motiva, escrita à mão.",
  "Seu cantinho de estudo visto de cima.",
  "O antes e depois da sua mesa (vale foto só do depois!).",
  "Um objeto que tem a ver com a matéria mais difícil do semestre.",
  "Um reflexo: no vidro, na tela desligada ou numa colher.",
  "As anotações coloridas de uma aula que você gostou.",
  "O céu no fim do seu dia de estudos.",
  "Algo roxo, porque todo grimório que se preze tem um pouco de roxo.",
];

export function todaysInspiration(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
  const index = Math.floor(Date.parse(`${day}T12:00:00Z`) / 86_400_000) % inspirations.length;
  return inspirations[index];
}

export const afterPostMessage = "Essa foto foi tirada com a ajuda do duendinho Kantinho! 🧚📸";
