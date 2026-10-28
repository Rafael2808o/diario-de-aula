import { useState } from "react";
import { ArrowLeft, BookOpenCheck, Brain, ChartLine, ChevronRight, CircleHelp, Hourglass, Layers, LifeBuoy, MessagesSquare, Mic, Music, NotebookPen, Route, Trophy } from "lucide-react";
import { useApp } from "../context.js";
import { apiBase } from "../lib/api.js";
import { Empty, FormError } from "../ui.jsx";
import { NoxPose } from "../components/Art.jsx";
import SpotifyPlayer from "../SpotifyPlayer.jsx";
import Explain from "../components/ai/Explain.jsx";
import Flashcards from "../components/ai/Flashcards.jsx";
import Quiz from "../components/ai/Quiz.jsx";
import Summary from "../components/ai/Summary.jsx";
import Transcribe from "../components/ai/Transcribe.jsx";
import { ExamPicker, PlanBuilder, Rescue } from "../components/ai/ExamTools.jsx";
import { AiUnavailable, useAiStatus } from "../components/ai/shared.jsx";

import { canonicalSpotify } from "../components/Ritual.jsx";

const spotifyEmbed = (value) => {
  const match = String(value || "").match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?(?:embed\/)?(playlist|album|episode|show|track)\/([A-Za-z0-9]+)/);
  return match ? `https://open.spotify.com/embed/${match[1]}/${match[2]}?utm_source=generator&theme=0` : null;
};

const tools = [
  { id: "socorro", icon: LifeBuoy, title: "Socorro, tenho prova!", text: "Roteiro guiado para a prova que está chegando.", ai: false },
  { id: "questoes", icon: NotebookPen, title: "Praticar questões", text: "Uma questão por vez, com a correção na hora.", ai: true },
  { id: "plano", icon: Route, title: "Plano de estudos", text: "Sessões distribuídas até a prova, no seu calendário.", ai: false },
  { id: "simulado", icon: CircleHelp, title: "Simulado", text: "Questões com explicação, a partir das suas aulas.", ai: true },
  { id: "resumo", icon: BookOpenCheck, title: "Resumir minhas aulas", text: "Revisão rápida, completa ou só o essencial.", ai: true },
  { id: "flashcards", icon: Layers, title: "Flashcards", text: "Repita o que ainda não ficou.", ai: false },
  { id: "explicar", icon: Brain, title: "Explicar o que não entendi", text: "Em linguagem simples, com exemplos.", ai: true },
  { id: "gravar", icon: Mic, title: "Gravar e transcrever aula", text: "Com autorização, vira texto e resumo.", ai: true },
];

const intents = [
  { tool: "socorro", icon: LifeBuoy, title: "Tenho uma prova", text: "Monte um roteiro de revisão até o dia." },
  { tool: "explicar", icon: Brain, title: "Quero entender", text: "Explique um conteúdo de forma simples." },
  { tool: "flashcards", icon: Layers, title: "Quero revisar", text: "Crie e revise cartas a partir das suas aulas." },
  { tool: "questoes", icon: NotebookPen, title: "Quero praticar", text: "Questões e simulados com base no seu conteúdo." },
  { tool: "gravar", icon: Mic, title: "Tenho uma aula gravada", text: "Transcreva e organize a aula." },
];

export default function StudyAI() {
  const { params } = useApp();
  if (!params.tool && !params.exam) return <StudyHub />;
  return <StudyTool />;
}

function StudyHub() {
  const { go, ritual } = useApp();
  const more = [
    { icon: BookOpenCheck, title: "Resumir minhas aulas", action: () => go("ia", { tool: "resumo" }) },
    { icon: CircleHelp, title: "Simulado com tempo", action: () => go("ia", { tool: "simulado" }) },
    { icon: Route, title: "Plano de estudos", action: () => go("ia", { tool: "plano" }) },
    { icon: Hourglass, title: "Ritual de Foco", action: () => ritual.setView("open") },
    { icon: Layers, title: "Cartas do Saber", action: () => go("cartoes") },
    { icon: MessagesSquare, title: "Conselho dos Bruxinhos", action: () => go("comunidade") },
    { icon: Trophy, title: "Ranking dos Bruxinhos", action: () => go("ranking") },
    { icon: ChartLine, title: "Histórico de aprendizagem", action: () => go("historico") },
  ];
  return (
    <div className="page study-hub">
      <header className="page-head with-nox">
        <div>
          <h1>Estudar com IA</h1>
          <p>Seu assistente parte das suas aulas, do cofre do professor e dos seus materiais. O que a IA gera aparece marcado como sugestão.</p>
        </div>
        <NoxPose pose="tarot" size={88} />
      </header>
      <section aria-labelledby="intencao-title">
        <h2 className="section-title" id="intencao-title">
          O que você quer fazer?
        </h2>
        <ul className="intent-list">
          {intents.map(({ tool, icon: Icon, title, text }) => (
            <li key={tool}>
              <button type="button" className={`intent ${tool === "socorro" ? "is-sos" : ""}`} onClick={() => go("ia", { tool })}>
                <span className="intent-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="row-main">
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
                <ChevronRight size={17} className="chevron" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="mais-title">
        <h2 className="section-title" id="mais-title">
          Mais para estudar
        </h2>
        <ul className="more-tools">
          {more.map(({ icon: Icon, title, action }) => (
            <li key={title}>
              <button type="button" onClick={action}>
                <Icon size={17} aria-hidden="true" /> {title}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <StudyMusic />
    </div>
  );
}

function StudyTool() {
  const { params, data, go } = useApp();
  const status = useAiStatus();
  const examFromLink = params.exam ? data.exams.find((exam) => exam.id === params.exam) : null;
  const [tool, setTool] = useState(tools.some((item) => item.id === params.tool) ? params.tool : examFromLink ? "simulado" : "socorro");
  const subjectFromLink = data.subjects.some((item) => item.id === params.subject) ? params.subject : "";
  const [preset, setPreset] = useState(examFromLink ? { subjectId: examFromLink.subjectId, examId: examFromLink.id, topic: examFromLink.topics.find((topic) => topic.status !== "Dominado")?.title || "" } : subjectFromLink ? { subjectId: subjectFromLink } : {});
  const [examId, setExamId] = useState(params.exam || "");
  const active = tools.find((item) => item.id === tool);
  const switchTool = (id, nextPreset = {}) => {
    setTool(id);
    setPreset(nextPreset);
    document.getElementById("ferramenta")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const needsSubjects = !data.subjects.length && !["socorro", "plano"].includes(tool);
  const planExam = data.exams.find((exam) => exam.id === examId);

  return (
    <div className="page study-ai">
      <button className="link-btn back" onClick={() => go("ia")}>
        <ArrowLeft size={15} /> Estudar
      </button>
      <div className="ai-layout single">
        <nav className="tool-tabs" aria-label="Ferramentas de estudo">
          {tools.map(({ id, icon: Icon, title }) => (
            <button key={id} type="button" aria-current={tool === id ? "true" : undefined} className={`${tool === id ? "is-active" : ""} ${id === "socorro" ? "is-sos" : ""}`} onClick={() => switchTool(id)}>
              <Icon size={15} aria-hidden="true" /> {title}
            </button>
          ))}
        </nav>
        <section className="tool-panel" id="ferramenta" aria-labelledby="tool-title">
          <h1 id="tool-title">{active.title}</h1>
          <p className="tool-lead">{active.text}</p>
          {active.ai && status && !status.configured ? (
            <AiUnavailable />
          ) : needsSubjects ? (
            <Empty title="Cadastre uma disciplina primeiro.">
              As ferramentas usam as aulas registradas em cada disciplina.
              <button className="btn small" onClick={() => go("conteudos")}>
                Cadastrar disciplina
              </button>
            </Empty>
          ) : (
            <>
              {tool === "socorro" && <Rescue examId={examId} setExamId={setExamId} onTool={switchTool} />}
              {tool === "plano" && (
                <div className="tool-body">
                  <ExamPicker value={examId} onChange={setExamId} />
                  {planExam && <PlanBuilder key={planExam.id} exam={planExam} />}
                  <p className="footnote">O plano usa a data da prova, os assuntos que você ainda não marcou como dominados, o domínio que você informou nas aulas e os minutos e horários das Configurações.</p>
                </div>
              )}
              {tool === "simulado" && <Quiz key={`s${JSON.stringify(preset)}`} preset={preset} mode="simulado" />}
              {tool === "questoes" && <Quiz key={`q${JSON.stringify(preset)}`} preset={preset} mode="praticar" />}
              {tool === "resumo" && <Summary key={JSON.stringify(preset)} preset={preset} />}
              {tool === "flashcards" && <Flashcards key={JSON.stringify(preset)} preset={preset} />}
              {tool === "explicar" && <Explain key={JSON.stringify(preset)} preset={preset} />}
              {tool === "gravar" && <Transcribe />}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function StudyMusic() {
  const { user, call, setUser } = useApp();
  // A playlist é a mesma do Ritual de Foco, salva na conta.
  const playlist = spotifyEmbed(user.preferences?.spotifyUrl) || "";
  const [playlistError, setPlaylistError] = useState("");
  return (
      <section className="study-music">
        <h2 className="section-title">Música para estudar</h2>
        <form
          className="inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const url = canonicalSpotify(new FormData(form).get("playlist"));
            if (!url) return setPlaylistError("Cole um link público do Spotify: playlist, álbum, faixa ou episódio.");
            setPlaylistError("");
            try {
              setUser(await call("/me", { method: "PATCH", body: { preferences: { spotifyUrl: url } } }));
              form.reset();
            } catch (failure) {
              setPlaylistError(failure.message);
            }
          }}
        >
          <label className="search-field">
            <Music size={15} aria-hidden="true" />
            <input id="playlist-link" name="playlist" aria-label="Link do Spotify" placeholder="Link de uma playlist do Spotify" />
          </label>
          <button className="btn">Usar</button>
        </form>
        <FormError>{playlistError}</FormError>
        <SpotifyPlayer playlist={playlist} apiBase={apiBase} go={() => document.getElementById("playlist-link")?.focus()} />
      </section>
  );
}
