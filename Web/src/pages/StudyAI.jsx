import { useState } from "react";
import { BookOpenCheck, Brain, ChartLine, CircleHelp, Layers, LifeBuoy, Mic, Music, Route } from "lucide-react";
import { useApp } from "../context.js";
import { apiBase } from "../lib/api.js";
import { Empty, FormError, Nox } from "../ui.jsx";
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
  { id: "plano", icon: Route, title: "Plano de estudos", text: "Sessões distribuídas até a prova, no seu calendário.", ai: false },
  { id: "simulado", icon: CircleHelp, title: "Simulado", text: "Questões com explicação, a partir das suas aulas.", ai: true },
  { id: "resumo", icon: BookOpenCheck, title: "Resumir minhas aulas", text: "Revisão rápida, completa ou só o essencial.", ai: true },
  { id: "flashcards", icon: Layers, title: "Flashcards", text: "Repita o que ainda não ficou.", ai: false },
  { id: "explicar", icon: Brain, title: "Explicar o que não entendi", text: "Em linguagem simples, com exemplos.", ai: true },
  { id: "gravar", icon: Mic, title: "Gravar e transcrever aula", text: "Com autorização, vira texto e resumo.", ai: true },
];

export default function StudyAI() {
  const { params, data, go, user, call, setUser } = useApp();
  const status = useAiStatus();
  const examFromLink = params.exam ? data.exams.find((exam) => exam.id === params.exam) : null;
  const [tool, setTool] = useState(tools.some((item) => item.id === params.tool) ? params.tool : examFromLink ? "simulado" : "socorro");
  const [preset, setPreset] = useState(examFromLink ? { subjectId: examFromLink.subjectId, examId: examFromLink.id, topic: examFromLink.topics.find((topic) => topic.status !== "Dominado")?.title || "" } : {});
  const [examId, setExamId] = useState(params.exam || "");
  // A playlist é a mesma do Ritual de Concentração, salva na conta.
  const playlist = spotifyEmbed(user.preferences?.spotifyUrl) || "";
  const [playlistError, setPlaylistError] = useState("");
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
      <header className="page-head with-nox">
        <div>
          <h1>Estudar com IA</h1>
          <p>As ferramentas partem das suas aulas, do cofre do professor e dos seus materiais. O que a IA gera aparece marcado como sugestão.</p>
        </div>
        <Nox size={76} />
      </header>

      <div className="ai-layout">
        <nav className="tool-list" aria-label="Ferramentas de estudo">
          {tools.map(({ id, icon: Icon, title, text }) => (
            <button key={id} type="button" aria-current={tool === id ? "true" : undefined} className={`tool ${tool === id ? "is-active" : ""} ${id === "socorro" ? "is-sos" : ""}`} onClick={() => switchTool(id)}>
              <Icon size={18} aria-hidden="true" />
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
            </button>
          ))}
          <button type="button" className="tool" onClick={() => go("historico")}>
            <ChartLine size={18} aria-hidden="true" />
            <span>
              <strong>Histórico de aprendizagem</strong>
              <small>Simulados, erros e revisões.</small>
            </span>
          </button>
        </nav>

        <section className="tool-panel" id="ferramenta" aria-labelledby="tool-title">
          <h2 id="tool-title">{active.title}</h2>
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
              {tool === "simulado" && <Quiz key={JSON.stringify(preset)} preset={preset} />}
              {tool === "resumo" && <Summary key={JSON.stringify(preset)} preset={preset} />}
              {tool === "flashcards" && <Flashcards key={JSON.stringify(preset)} preset={preset} />}
              {tool === "explicar" && <Explain key={JSON.stringify(preset)} preset={preset} />}
              {tool === "gravar" && <Transcribe />}
            </>
          )}
        </section>
      </div>

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
    </div>
  );
}
