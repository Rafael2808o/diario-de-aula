import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useApp } from "../context.js";
import { NoxPose } from "./Art.jsx";

// Passeio guiado pelo Nox: destaca os elementos de verdade da interface, navegando até a página de cada um.
// Se um elemento não existir (ex.: conta sem disciplinas), o balão aparece no centro e o passeio continua.
// A conclusão fica na conta (preferences.tutorialDone).
export const tourSteps = [
  { stage: "Dashboard", page: "inicio", target: ".focus-card", pose: "star", text: "Este é o seu cantinho principal! Aqui você acompanha seu progresso, suas próximas aulas, provas, atividades e recomendações do Grimiau.", points: ["Meu progresso", "Próximo Ritual"] },
  { stage: "Dashboard", page: "inicio", target: "[aria-labelledby='compromissos-title'], .home-side .advice", pose: "reading", text: "Logo abaixo ficam os próximos compromissos e as recomendações do Grimiau para hoje.", points: ["Próximos compromissos", "Recomendações"] },
  { stage: "Meu Grimório", page: "conteudos", target: "main .page", pose: "reading", text: "Aqui ficam suas matérias e todo o conhecimento que você está construindo! Registre suas aulas, organize materiais e acompanhe o conteúdo de cada disciplina.", points: ["Disciplinas", "Registro de aula", "Materiais", "Provas e atividades"] },
  { stage: "Cartas do Saber", page: "cartoes", target: "main .page-head", pose: "tarot", text: "Quer testar sua memória? Aqui você pode estudar com flashcards e perguntas sobre os conteúdos das suas matérias!", points: ["Criação de cartas", "Seleção de disciplina", "Sessões de estudo", "Revisões"] },
  { stage: "Ritual", page: "inicio", target: ".ritual-launch", pose: "waiting", text: "Chegou a hora de concentrar sua magia! Escolha uma matéria, inicie seu Ritual e acompanhe o tempo dedicado aos estudos.", points: ["Seleção de disciplina", "Timer", "Iniciar e pausar", "Registro da sessão"] },
  { stage: "Sala de Estudos", page: "compartilhadas", target: "main .page-head", pose: "reading", text: "Tem trabalho em grupo? Reúna seus colegas, distribua as tarefas e acompanhe os prazos sem precisar organizar tudo em vários aplicativos!", points: ["Cadastro de trabalhos", "Integrantes", "Quadro de tarefas", "Chamadas em grupo"] },
  { stage: "Comunidade", page: "comunidade", target: ".community-areas", pose: "star", text: "Este é o espaço para encontrar outros bruxinhos! Compartilhe resumos, converse, publique fotos e acompanhe as novidades dos seus colegas.", points: ["Conselho dos Bruxinhos", "Bate-papo", "Comunicados Gerais", "Resumos Compartilhados", "Feed dos Migles"] },
  { stage: "Finalização", page: null, target: null, pose: "celebrate", text: "Prontinho! Agora você conhece os principais cantinhos do Grimiau. Seu universo de estudos está esperando por você. Que sua jornada seja cheia de descobertas! 💜", points: [] },
];

const pad = 8;
const visible = (element) => {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
};

export function TourInvite({ onStart, onDismiss }) {
  return (
    <div className="tour-invite" role="dialog" aria-labelledby="tour-invite-title">
      <NoxPose pose="star" size={84} label="" />
      <div>
        <p id="tour-invite-title">
          <strong>Oi, bruxinhe! 🐈‍⬛✨</strong>
        </p>
        <p>Seja bem-vindo ao Grimiau! Eu sou seu guia mágico e vou apresentar os principais cantinhos do nosso universo.</p>
        <p>Quer conhecer tudo comigo?</p>
        <div className="tour-invite-actions">
          <button type="button" className="btn primary" onClick={onStart}>
            Sim, vamos começar!
          </button>
          <button type="button" className="btn ghost" onClick={onDismiss}>
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Tour({ onClose }) {
  const { go, page, call, setUser } = useApp();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [bubble, setBubble] = useState({ top: 0, left: 0, placement: "center" });
  const bubbleRef = useRef(null);
  const step = tourSteps[index];
  const last = index === tourSteps.length - 1;

  // Vai até a página do passo e espera o elemento aparecer (até ~2,5 s).
  useEffect(() => {
    if (step.page && page !== step.page) go(step.page);
    window.__grimiauTour = true;
    let tries = 0;
    let frame;
    setRect(null);
    const find = () => {
      const element = step.target ? [...document.querySelectorAll(step.target)].find(visible) : null;
      if (element) {
        element.scrollIntoView({ block: "center", behavior: "auto" });
        requestAnimationFrame(() => setRect(element.getBoundingClientRect()));
        return;
      }
      tries += 1;
      if (tries < 25 && step.target) frame = setTimeout(find, 100);
    };
    frame = setTimeout(find, step.page && page !== step.page ? 250 : 30);
    return () => clearTimeout(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => () => {
    window.__grimiauTour = false;
  }, []);

  // Acompanha rolagem e mudança de tamanho.
  const refresh = useCallback(() => {
    const element = step.target ? [...document.querySelectorAll(step.target)].find(visible) : null;
    setRect(element ? element.getBoundingClientRect() : null);
  }, [step.target]);
  useEffect(() => {
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [refresh]);

  // Balão abaixo do elemento se couber; senão acima; senão no centro.
  useLayoutEffect(() => {
    const box = bubbleRef.current?.getBoundingClientRect();
    const height = box?.height || 220;
    const width = box?.width || 320;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!rect) return setBubble({ top: Math.max(16, (vh - height) / 2), left: Math.max(16, (vw - width) / 2), placement: "center" });
    const left = Math.min(Math.max(16, rect.left + rect.width / 2 - width / 2), vw - width - 16);
    const bottomNav = vw <= 900 ? 70 : 0;
    if (rect.bottom + pad + 12 + height < vh - bottomNav) return setBubble({ top: rect.bottom + pad + 12, left, placement: "below" });
    if (rect.top - pad - 12 - height > 8) return setBubble({ top: rect.top - pad - 12 - height, left, placement: "above" });
    return setBubble({ top: Math.max(16, vh - bottomNav - height - 16), left, placement: "over" });
  }, [rect, index]);

  const finish = async (done) => {
    window.__grimiauTour = false;
    const preferences = done ? { tutorialDone: true, tutorialInvite: false } : { tutorialInvite: false };
    call("/me", { method: "PATCH", body: { preferences } }).then(setUser).catch(() => {});
    if (done) go("inicio");
    onClose();
  };
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") finish(false);
      if (event.key === "ArrowRight") last ? finish(true) : setIndex((value) => value + 1);
      if (event.key === "ArrowLeft") setIndex((value) => Math.max(0, value - 1));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [last]);

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {rect ? (
        <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} aria-hidden="true" />
      ) : (
        <div className="tour-dim" aria-hidden="true" />
      )}
      <div ref={bubbleRef} className={`tour-bubble is-${bubble.placement}`} style={{ top: bubble.top, left: bubble.left }} key={index}>
        <NoxPose pose={step.pose} size={64} className="tour-nox" label="" />
        <div className="tour-body">
          <p className="tour-stage">
            Etapa {Math.min(index + 1, tourSteps.length)} de {tourSteps.length} · {step.stage}
          </p>
          <p id="tour-title">{step.text}</p>
          {step.points.length > 0 && (
            <ul className="tour-points">
              {step.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          )}
          <div className="tour-actions">
            <button type="button" className="btn ghost small" onClick={() => finish(false)}>
              <X size={14} /> Sair
            </button>
            <span className="spacer" />
            {index > 0 && (
              <button type="button" className="btn small" onClick={() => setIndex(index - 1)}>
                <ArrowLeft size={14} /> Voltar
              </button>
            )}
            <button type="button" className="btn small primary" onClick={() => (last ? finish(true) : setIndex(index + 1))}>
              {last ? "Começar minha jornada!" : (
                <>
                  Próximo <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
