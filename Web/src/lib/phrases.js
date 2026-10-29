// Frases do Ritual de Concentração. Trocam sozinhas durante a sessão; as de descanso aparecem nas pausas.
export const focusPhrases = [
  "Mana, até a magia exige dedicação. Bora estudar! ✨",
  "Um pouquinho de foco agora, um surto a menos na semana da prova.",
  "Grimório aberto, distrações fechadas. Vamos de milhões!",
  "POV: você virou a universitária que realmente revisa o conteúdo.",
  "Você e seu potencial acadêmico? Simplesmente um evento.",
  "Estudando em silêncio para deixar a nota fazer barulho.",
  "O conhecimento está entrando e o desespero da prova está saindo.",
  "Foco ativado. Energia de protagonista acadêmica desbloqueada.",
  "Bora, bruxinha! Seu próximo feitiço é passar nessa prova. 🪄",
  "As estrelas estão alinhadas, mas você precisa abrir o caderno. 🌙",
  "Pequenos feitiços, grandes aprovações.",
  "Seu gatinho familiar acredita no seu potencial acadêmico.",
  "A bruxaria de hoje é não deixar tudo para a véspera.",
  "Uma página de cada vez, um feitiço de cada vez.",
  "Seu grimório está aberto. Vamos desvendar mais um mistério?",
  "Cada novo conteúdo é mais um poder desbloqueado.",
  "Você não precisa saber tudo agora. Só precisa começar.",
  "Não é falta de capacidade, é só mais um conteúdo para desvendar.",
  "Seu eu do futuro está mandando um obrigada por estudar hoje.",
  "Um passo de cada vez também é progresso.",
  "Você merece reconhecer o esforço que está fazendo.",
  "Celular virado para baixo é o feitiço de proteção mais forte que existe.",
  "Nox está de olho: nada de abrir outra aba agora. 🐈‍⬛",
  "Resumo feito hoje é madrugada de véspera que não existe.",
  "A lua não tem pressa e mesmo assim completa o ciclo. Você também.",
  "Lembra daquela matéria que parecia impossível? Pois é, passou.",
  "Leia de novo aquele trecho. A segunda leitura é onde a mágica acontece.",
  "Seu cérebro está fazendo musculação. Pode doer um pouquinho, é normal.",
  "Ninguém nasce sabendo, mas você está bem perto de saber.",
  "Concentração de quem vai gabaritar e ainda explicar para a turma.",
  "Mais um parágrafo e você já pode se chamar de especialista. Quase.",
  "Feitiço do dia: entender em vez de decorar.",
  "Constelação do foco: você, o caderno e mais ninguém.",
  "O grimório é grande, mas você vira uma página de cada vez.",
  "Quem estuda com calma lembra na hora da prova.",
  "Agora não é hora de reorganizar o quarto. Juro.",
  "A versão de você que passou nessa matéria agradece esse esforço.",
  "Até as estrelas levam tempo para brilhar. Continua.",
  "Escreve com suas palavras. É assim que o conteúdo vira seu.",
  "Seu potencial está carregando… 87%… quase lá.",
  "Um passinho de cada vez também leva longe, estrelinha.",
  "Seu futuro está sendo construído até nos dias mais lentos.",
  "Respira, organiza as ideias e começa pelo possível.",
  "Até a Lua passa por fases. Você também pode ir no seu ritmo.",
  "Estrelinha, o caderno aberto já é meio caminho andado.",
  "Hoje não precisa ser perfeito. Só precisa ser feito.",
  "Devagar e com constância: é assim que as constelações se formam.",
];

export const restPhrases = [
  "Até os familiares precisam recarregar a energia lunar.",
  "Pausa também faz parte do ritual. Vá com calma.",
  "Respira, toma uma aguinha e volta para o grimório. Você consegue!",
  "Alonga as costas. Nox está fazendo o mesmo.",
  "Olha para longe um pouquinho. Seus olhos agradecem.",
  "Descansar também é estudar: é agora que a memória se organiza.",
  "Um lanchinho e um pouco de água. O feitiço volta já já.",
  "Nox tirou uma soneca. Você pode tirar cinco minutos.",
];

// Sorteia sem repetir até passar por todas as frases da lista.
export function phraseBag(list) {
  let bag = [];
  let last = "";
  return () => {
    if (!bag.length) bag = [...list].sort(() => Math.random() - 0.5);
    let next = bag.pop();
    if (next === last && bag.length) {
      bag.unshift(next);
      next = bag.pop();
    }
    last = next;
    return next;
  };
}
