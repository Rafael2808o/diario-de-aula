import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, BookOpenCheck, BrainCircuit, CalendarHeart, Camera, ChartColumn, FileImage, Hourglass, KanbanSquare, LibraryBig, Megaphone,
  MessagesSquare, PhoneCall, ScrollText, Sparkles, Trophy, UserRoundCheck, Users, UsersRound, BellRing, X, Heart, Puzzle, Target, Star, Moon, Flame,
} from "lucide-react";
import { useApp } from "../context.js";
import { NoxPose } from "./Art.jsx";
import { kantinhoImage } from "../lib/kantinho.js";

// Apresentação de lançamento da 3.0: abertura, 21 novidades e tela final, em tela cheia.
// Fica salvo na conta: presentationSeen = versão já apresentada; presentationStep = tela em que a pessoa parou.
// Fechar antes do fim não marca como vista: na próxima entrada a apresentação continua de onde parou.
export const presentationVersion = "3.0";

const slides = [
  { title: "Novo tutorial", text: "Conheça o Grimiau com o Nox! Um passeio guiado mostra, nas telas de verdade, onde fica cada cantinho. Ele está sempre em Configurações › Tutorial do Grimiau.", art: { nox: "star" }, tone: "lilac" },
  { title: "Inteligência artificial aprimorada", text: "A IA agora parte do conteúdo das suas aulas, resumos e materiais. Nada de perguntas sobre prazos, professores ou recados da turma: só o que você precisa saber de verdade.", art: { icon: BrainCircuit, orbit: [Sparkles, BookOpenCheck] }, tone: "lilac" },
  { title: "Questões mais desafiadoras", text: "Simulados e cartas com interpretação, comparação e aplicação de conceitos, e alternativas que fazem pensar. Chega de resposta óbvia!", art: { icon: Target, orbit: [Puzzle, Flame] }, tone: "rose" },
  { title: "Materiais em PDF", text: "Tirou foto dos slides? No registro da aula, em Materiais, use “Adicionar fotos dos slides”: organize, reordene e o Grimiau monta um PDF com capa mística, salvo na disciplina.", art: { icon: FileImage, orbit: [ScrollText, Star] }, tone: "gold" },
  { title: "Feriados no calendário", text: "Os feriados nacionais aparecem sozinhos e não viram pendência. Recesso ou feriado da sua cidade? Adicione em Configurações › Feriados e dias sem aula.", art: { icon: CalendarHeart, orbit: [Moon, Star] }, tone: "sky" },
  { title: "Ritual aprimorado", text: "O cronômetro só conta com o Grimiau aberto, e o próximo Ritual sugere um conteúdo que você ainda não estudou, em vez de repetir o de ontem.", art: { nox: "waiting", orbit: [Hourglass] }, tone: "gold" },
  { title: "Relatório mensal", text: "Quanto você estudou no mês, quanto foi para cada matéria e quais lideram o ranking, com gráficos e comparação com o mês anterior. Fica em Histórico de estudos.", art: { icon: ChartColumn, orbit: [Trophy, Sparkles] }, tone: "sage" },
  { title: "Nova área Comunidade", text: "Um espaço só para os bruxinhos: Conselho, Bate-papo, Comunicados, Resumos e Feed, com um pontinho dourado quando chega novidade.", art: { icon: Heart, orbit: [Users, Sparkles] }, tone: "rose" },
  { title: "Conselho dos Bruxinhos", text: "Sugestões, melhorias e erros encontrados vão para o Conselho, com status: Recebido, Em análise, Em desenvolvimento e Resolvido. Acompanhe as suas em “Minhas”.", art: { icon: ScrollText, orbit: [Star, BellRing] }, tone: "gold" },
  { title: "Novo Bate-papo", text: "Escreva uma cartinha em estilo tarô para conversar com os migles. Elas recebem reações e respostas, e desaparecem depois de 48 horas.", art: { icon: MessagesSquare, orbit: [Heart, Moon], card: true }, tone: "rose" },
  { title: "Comunicados Gerais", text: "Avisos oficiais de provas, trabalhos e eventos num só lugar. Os importantes chegam no seu sino; marque como lido quando conferir.", art: { icon: Megaphone, orbit: [BellRing, Star] }, tone: "lilac" },
  { title: "Resumos Compartilhados", text: "Compartilhe seus resumos (+50 XP), reaja aos dos colegas (+20 XP) e salve no seu Grimório com o crédito de quem fez (+40 XP).", art: { icon: LibraryBig, orbit: [BookOpenCheck, Heart] }, tone: "sage" },
  { title: "Feed dos Migles", text: "Uma foto por dia dos seus momentos de estudo vale +200 XP. Curta, reaja e comente: cada foto fica 24 horas e depois vira poeira de estrelas.", art: { icon: Camera, orbit: [Heart, Sparkles], polaroid: true }, tone: "sky" },
  { title: "Kantinho, o duende blogueiro", text: "O fotógrafo oficial do Grimiau traz uma inspiração mágica nova todos os dias para a sua próxima foto. Você segue se quiser!", art: { kantinho: true }, tone: "lilac" },
  { title: "Mural de XP", text: "No Início, veja as conquistas da comunidade, reaja com 💜😂🔥👏👀 e consulte as regras de XP. Quem não está no Ranking aparece como “Um bruxinho”.", art: { nox: "celebrate", orbit: [Trophy] }, tone: "gold" },
  { title: "Sala de Estudos", text: "As Atividades compartilhadas viraram a Sala de Estudos: seus trabalhos em grupo com documento, quadro de tarefas e chamada, tudo no mesmo lugar.", art: { icon: Users, orbit: [KanbanSquare, PhoneCall] }, tone: "sky" },
  { title: "Formação de grupos", text: "Cadastre o trabalho e chame sua agência, sorteie colegas do seu curso ou escolha pelo nome. Cada pessoa recebe o aviso de que entrou no grupo.", art: { icon: UsersRound, orbit: [Sparkles, Star] }, tone: "rose" },
  { title: "Quadro de tarefas", text: "Pendente, Em andamento e Concluído: divida as partes, defina responsáveis e prazos e acompanhe tudo junto com o grupo.", art: { icon: KanbanSquare, orbit: [Target, Star] }, tone: "sage" },
  { title: "Cobranças e lembretes", text: "A partir de um dia antes do prazo, mande um lembrete mágico para quem está devendo. Tarefa que passa do prazo sem ser concluída custa −300 XP ao responsável.", art: { icon: BellRing, orbit: [Hourglass, Flame] }, tone: "gold" },
  { title: "Chamadas em grupo", text: "Áudio e vídeo com os integrantes do trabalho, direto pelo Grimiau: liga e desliga microfone e câmera, vê quem está na chamada e sai quando quiser.", art: { icon: PhoneCall, orbit: [Users, Sparkles] }, tone: "lilac" },
  { title: "Perfil acadêmico", text: "Nome completo, RA e sua agência ficam salvos. No trabalho, “Copiar lista de integrantes” gera a lista em ordem alfabética, pronta para a capa.", art: { icon: UserRoundCheck, orbit: [ScrollText, Star] }, tone: "sky" },
];
const total = slides.length;

function Stars() {
  return (
    <div className="pres-stars" aria-hidden="true">
      {Array.from({ length: 28 }, (_, index) => (
        <i key={index} style={{ "--i": index, left: `${(index * 37) % 100}%`, top: `${(index * 53) % 100}%` }} />
      ))}
    </div>
  );
}

function Art({ art, index }) {
  const Icon = art.icon;
  return (
    <div className={`pres-art ${art.card ? "is-card" : ""} ${art.polaroid ? "is-polaroid" : ""}`} aria-hidden="true">
      <svg className="pres-constellation" viewBox="0 0 200 200">
        <path d={`M${30 + (index % 4) * 8} 40 L90 ${22 + (index % 3) * 10} L160 ${50 + (index % 5) * 6} L170 140 L${70 + (index % 3) * 10} 170 L28 120 Z`} fill="none" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 4" />
        {[[30, 40], [90, 28], [160, 54], [170, 140], [78, 170], [28, 120]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="currentColor" />
        ))}
      </svg>
      <div className="pres-portal">
        {art.kantinho ? (
          <img src={kantinhoImage} alt="" className="pres-kantinho" />
        ) : art.nox ? (
          <NoxPose pose={art.nox} size={150} label="" />
        ) : (
          <Icon size={74} strokeWidth={1.2} />
        )}
      </div>
      {(art.orbit || []).map((Orbit, orbitIndex) => (
        <span key={orbitIndex} className={`pres-orbit o${orbitIndex}`}>
          <Orbit size={22} strokeWidth={1.5} />
        </span>
      ))}
    </div>
  );
}

export default function Presentation({ onDone }) {
  const { user, call, setUser } = useApp();
  const saved = user.preferences?.presentationStep || 0;
  const [step, setStep] = useState(Math.min(saved, total + 1));
  const [direction, setDirection] = useState(1);
  const panel = useRef(null);
  const save = (preferences) => call("/me", { method: "PATCH", body: { preferences } }).then(setUser).catch(() => {});

  useEffect(() => {
    panel.current?.focus();
    document.body.classList.add("modal-open");
    return () => document.body.classList.remove("modal-open");
  }, []);
  // Guarda a tela atual (sem marcar como vista).
  useEffect(() => {
    if (step === saved || step > total) return undefined;
    const timer = setTimeout(() => save({ presentationStep: step }), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const go = (next) => {
    setDirection(next > step ? 1 : -1);
    setStep(Math.max(0, Math.min(total + 1, next)));
  };
  const finish = async () => {
    await save({ presentationSeen: presentationVersion, presentationStep: 0, announcementSeen: "3.0.0" });
    onDone();
  };
  const close = () => {
    save({ presentationStep: step > total ? total : step });
    onDone();
  };
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "ArrowRight" && step <= total) go(step + 1);
      if (event.key === "ArrowLeft" && step > 0) go(step - 1);
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const slide = step >= 1 && step <= total ? slides[step - 1] : null;
  return (
    <div className="presentation" role="dialog" aria-modal="true" aria-labelledby="pres-title" tabIndex={-1} ref={panel}>
      <Stars />
      <button type="button" className="pres-close icon-btn" aria-label="Fechar a apresentação (ela continua de onde parou na próxima vez)" onClick={close}>
        <X size={20} />
      </button>
      <div key={step} className={`pres-screen ${direction < 0 ? "is-back" : ""} tone-${slide?.tone || "lilac"}`}>
        {step === 0 && (
          <div className="pres-content pres-opening">
            <div className="pres-art is-opening" aria-hidden="true">
              <div className="pres-portal">
                <NoxPose pose="star" size={170} label="" />
              </div>
            </div>
            <p className="pres-kicker">Uma nova fase</p>
            <h1 id="pres-title" className="pres-brand">GRIMIAU V3.0</h1>
            <p className="pres-lead">O Grimiau evoluiu! ✨</p>
            <p className="pres-text">Seu universo de estudos acaba de ganhar novas possibilidades! Prepare-se para descobrir tudo o que mudou e explorar uma nova fase da sua jornada acadêmica.</p>
            <div className="pres-actions">
              <button type="button" className="btn primary pres-next" onClick={() => go(1)}>
                Ver as novidades <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {slide && (
          <div className="pres-content">
            <Art art={slide.art} index={step} />
            <p className="pres-kicker">
              {String(step).padStart(2, "0")} / {total} — {slide.title.toUpperCase()}
            </p>
            <h1 id="pres-title">{slide.title}</h1>
            <p className="pres-text">{slide.text}</p>
            <div className="pres-progress" role="progressbar" aria-valuemin={1} aria-valuemax={total} aria-valuenow={step} aria-label="Progresso das novidades">
              <span style={{ width: `${(step / total) * 100}%` }} />
            </div>
            <div className="pres-actions">
              <button type="button" className="btn ghost" onClick={() => go(step - 1)}>
                <ArrowLeft size={16} /> Voltar
              </button>
              <button type="button" className="btn primary pres-next" onClick={() => go(step + 1)}>
                {step === total ? "Concluir" : "Próxima novidade"} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        {step === total + 1 && (
          <div className="pres-content pres-final">
            <div className="pres-art is-opening" aria-hidden="true">
              <div className="pres-portal">
                <NoxPose pose="celebrate" size={170} label="" />
              </div>
            </div>
            <h1 id="pres-title">Seu universo está pronto para ser explorado!</h1>
            <div className="pres-actions">
              <button type="button" className="btn primary pres-next" onClick={finish}>
                Explorar meu Grimiau ✨
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
