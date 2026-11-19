import { useState } from "react";
import { ArrowLeft, ArrowRight, NotebookText, RefreshCw, Sparkles, Timer, BookOpenCheck, Brain, ChartLine, ChevronRight, CircleHelp, Hourglass, Layers, LifeBuoy, MessagesSquare, Mic, Music, NotebookPen, Route, Trophy, Camera, Users, Swords } from "lucide-react";
import { useApp } from "../context.js";
import { apiBase } from "../lib/api.js";
import { addDays, countdown, formatShort, range, toDate, todayIso, weekdayOf } from "../lib/dates.js";
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

// Métodos de estudo com evidência (conteúdo fixo de apoio, não é dado de ninguém). Um por dia; dá para trocar.
const methods = [
  { name: "Interrogação Elaborativa", text: "Pergunte “por quê?”, “como?” e “qual a relação?” sobre cada conceito, e responda com as suas palavras.", time: "15–20 min", steps: ["Escolha um conceito da aula.", "Responda “por que isso acontece?” e “como funciona?”.", "Relacione com outro conceito da disciplina."], tool: "explicar", cta: "Explicar com a IA" },
  { name: "Técnica Feynman", text: "Explique o assunto como se fosse para alguém que nunca ouviu falar. Onde travar, é o ponto a estudar.", time: "20 min", steps: ["Escreva o assunto no topo de uma folha.", "Explique em linguagem simples, sem jargão.", "Volte nas aulas onde a explicação travou."], tool: "explicar", cta: "Pedir uma explicação" },
  { name: "Recordação Ativa", text: "Tente lembrar sem olhar a matéria. Puxar da memória fixa mais do que reler.", time: "15 min", steps: ["Feche o caderno.", "Responda questões sobre a aula.", "Confira e anote o que esqueceu."], tool: "questoes", cta: "Praticar questões" },
  { name: "Repetição Espaçada", text: "Revise pouco e várias vezes, com intervalos cada vez maiores. As Cartas do Saber cuidam do intervalo.", time: "10 min", steps: ["Abra as Cartas do Saber.", "Revise as que estão para hoje.", "Marque com sinceridade o que já domina."], page: "cartoes", cta: "Revisar cartas" },
  { name: "Pomodoro", text: "Blocos curtos de foco total com pausas. Bom para começar quando falta vontade.", time: "25 + 5 min", steps: ["Escolha uma tarefa só.", "Foque 25 minutos sem celular.", "Pause 5 minutos e repita."], ritual: true, cta: "Começar um Ritual" },
  { name: "Prática Intercalada", text: "Misture assuntos diferentes na mesma sessão em vez de estudar um de cada vez. Prepara melhor para a prova.", time: "30 min", steps: ["Junte dois ou três assuntos da prova.", "Resolva questões misturadas.", "Veja em quais você mais erra."], tool: "simulado", cta: "Fazer um simulado" },
];

const modes = [
  { tool: "explicar", icon: Brain, label: "Entender um conteúdo" },
  { tool: "flashcards", icon: Layers, label: "Memorizar" },
  { tool: "questoes", icon: NotebookPen, label: "Praticar" },
  { tool: "socorro", icon: LifeBuoy, label: "Preparar para prova" },
];

function WeekFocus() {
  const { data } = useApp();
  const today = todayIso();
  const start = addDays(today, -((toDate(today).getUTCDay() + 6) % 7));
  const days = range(start, addDays(start, 6)).map((date) => ({
    date,
    minutes: Math.round(data["study-sessions"].filter((session) => session.date === date).reduce((sum, session) => sum + (session.durationSeconds || 0), 0) / 60),
  }));
  const total = days.reduce((sum, day) => sum + day.minutes, 0);
  const top = Math.max(30, ...days.map((day) => day.minutes));
  return (
    <section className="sh-card">
      <h2>Seu foco na semana</h2>
      <p className="sh-big">{total >= 60 ? `${Math.floor(total / 60)} h${total % 60 ? ` ${total % 60} min` : ""}` : `${total} min`}</p>
      <p className="hint">salvos no Ritual desde segunda</p>
      <ol className="sh-bars" aria-label="Minutos de foco por dia">
        {days.map((day) => (
          <li key={day.date} className={day.date === today ? "today" : ""} title={`${weekdayOf(day.date)}: ${day.minutes} min`}>
            <i style={{ height: `${Math.max(4, (day.minutes / top) * 100)}%` }} />
            <span>{weekdayOf(day.date).charAt(0)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StudyHub() {
  const { go, ritual, data } = useApp();
  const today = todayIso();
  const [subjectId, setSubjectId] = useState("");
  const [methodIndex, setMethodIndex] = useState(() => Math.floor(Date.parse(today) / 86400000) % methods.length);
  const method = methods[methodIndex % methods.length];
  const exams = data.exams.filter((exam) => exam.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  const lastLesson = [...data.lessons].filter((lesson) => lesson.date <= today).sort((a, b) => b.date.localeCompare(a.date))[0];
  const subjectName = (id) => data.subjects.find((subject) => subject.id === id)?.name || "Sem disciplina";
  const startMethod = () => {
    if (method.ritual) return ritual.setView("open");
    if (method.page) return go(method.page);
    return go("ia", { tool: method.tool, subject: subjectId });
  };
  const more = [
    { icon: BookOpenCheck, title: "Resumir minhas aulas", action: () => go("ia", { tool: "resumo" }) },
    { icon: CircleHelp, title: "Simulado com tempo", action: () => go("ia", { tool: "simulado" }) },
    { icon: Route, title: "Plano de estudos", action: () => go("ia", { tool: "plano" }) },
    { icon: Mic, title: "Gravar e transcrever aula", action: () => go("ia", { tool: "gravar" }) },
    { icon: Users, title: "Ritual em grupo", action: () => go("foco") },
    { icon: Swords, title: "Perguntados", action: () => go("perguntados") },
    { icon: Layers, title: "Cartas do Saber", action: () => go("cartoes") },
    { icon: Trophy, title: "Ranking dos Bruxinhos", action: () => go("ranking") },
    { icon: ChartLine, title: "Histórico de aprendizagem", action: () => go("historico") },
  ];
  return (
    <div className="page study-hub sh-v4">
      <div className="sh-main">
        <header className="page-head with-nox">
          <div>
            <h1>Estudar com IA ✦</h1>
            <p>Seu assistente parte das suas aulas, do cofre do professor e dos seus materiais. O que a IA gera aparece marcado como sugestão.</p>
          </div>
          <NoxPose pose="tarot" size={88} />
        </header>

        <section className="sh-start" aria-labelledby="sh-start-title">
          <p className="eyebrow">
            <Sparkles size={13} /> Vamos começar?
          </p>
          <h2 id="sh-start-title">
            O que você quer estudar <em>hoje</em>?
          </h2>
          {data.subjects.length > 0 && (
            <div className="sh-subjects" role="group" aria-label="Disciplina">
              {data.subjects.map((subject) => (
                <button key={subject.id} type="button" aria-pressed={subjectId === subject.id} className={subjectId === subject.id ? "on" : ""} style={{ "--subject": subject.color }} onClick={() => setSubjectId(subjectId === subject.id ? "" : subject.id)}>
                  <i aria-hidden="true" /> {subject.name}
                </button>
              ))}
            </div>
          )}
          <div className="sh-modes">
            {modes.map(({ tool, icon: Icon, label }) => (
              <button key={tool} type="button" className="btn ghost" onClick={() => go("ia", { tool, subject: subjectId })}>
                <Icon size={16} aria-hidden="true" /> {label}
              </button>
            ))}
          </div>
          <p className="hint">{subjectId ? `A IA vai usar as aulas e materiais de ${subjectName(subjectId)}.` : "Escolha uma disciplina para a IA usar só as aulas e materiais dela."}</p>
        </section>

        <section aria-labelledby="sh-method-title">
          <div className="sh-section-head">
            <h2 id="sh-method-title" className="section-title">
              Método de estudo para hoje
            </h2>
            <button type="button" className="link-btn" onClick={() => setMethodIndex(methodIndex + 1)}>
              <RefreshCw size={14} aria-hidden="true" /> Experimentar outro método
            </button>
          </div>
          <article className="sh-method">
            <div>
              <h3>{method.name}</h3>
              <p>{method.text}</p>
              <span className="sh-pill">
                <Timer size={13} aria-hidden="true" /> {method.time}
              </span>
            </div>
            <div className="sh-mission">
              <strong>Sua missão de hoje:</strong>
              <ol>
                {method.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <button type="button" className="btn primary small" onClick={startMethod}>
                {method.cta} <ArrowRight size={14} aria-hidden="true" />
              </button>
            </div>
          </article>
        </section>

        <section aria-labelledby="intencao-title">
          <h2 className="section-title" id="intencao-title">
            O que você precisa fazer?
          </h2>
          <ul className="sh-intents">
            {intents.map(({ tool, icon: Icon, title, text }) => (
              <li key={tool}>
                <button type="button" className={tool === "socorro" ? "is-sos" : ""} onClick={() => go("ia", { tool })}>
                  <Icon size={20} aria-hidden="true" />
                  <strong>{title}</strong>
                  <small>{text}</small>
                  <ArrowRight size={16} className="sh-go" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {lastLesson && (
          <section aria-labelledby="sh-continue-title">
            <h2 className="section-title" id="sh-continue-title">
              Continue de onde parou
            </h2>
            <article className="sh-continue">
              <NotebookText size={20} aria-hidden="true" />
              <div>
                <small>Última aula registrada · {formatShort(lastLesson.date)}</small>
                <strong>{lastLesson.theme || "Aula sem tema"}</strong>
                <span>{subjectName(lastLesson.subjectId)}</span>
              </div>
              <button type="button" className="btn primary small" onClick={() => go("caderno", { lesson: lastLesson.id })}>
                Abrir o caderno <ArrowRight size={14} aria-hidden="true" />
              </button>
            </article>
          </section>
        )}

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

      <aside className="sh-side">
        <WeekFocus />
        <section className="sh-card">
          <header>
            <h2>Próximas provas</h2>
            <button type="button" className="link-btn" onClick={() => go("provas")}>
              Ver todas
            </button>
          </header>
          {exams.length ? (
            <ul className="sh-exams">
              {exams.map((exam) => (
                <li key={exam.id}>
                  <button type="button" onClick={() => go("ia", { exam: exam.id })}>
                    <strong>{exam.title}</strong>
                    <span>
                      {subjectName(exam.subjectId)} · {countdown(exam.date, today)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="hint">Nenhuma prova marcada. Cadastre em Provas para a IA montar o roteiro.</p>
          )}
        </section>
        <section className="sh-card sh-ritual">
          <Hourglass size={20} aria-hidden="true" />
          <h2>Seu Ritual de Foco</h2>
          <p>Hora de se concentrar? Coloque sua playlist, ligue o cronômetro e mergulhe nos estudos.</p>
          <button type="button" className="btn ghost" onClick={() => ritual.setView("open")}>
            Abrir o Ritual
          </button>
        </section>
      </aside>
    </div>
  );
}

function StudyTool() {
  const { params, data, go } = useApp();
  const status = useAiStatus();
  const examFromLink = params.exam ? data.exams.find((exam) => exam.id === params.exam) : null;
  const [tool, setTool] = useState(tools.some((item) => item.id === params.tool) ? params.tool : examFromLink ? "simulado" : "socorro");
  const subjectFromLink = data.subjects.some((item) => item.id === params.subject) ? params.subject : "";
  // Aberto do Caderno de uma aula (?lesson=): as ferramentas usam só as anotações daquela aula.
  const lessonFromLink = params.lesson ? data.lessons.find((lesson) => lesson.id === params.lesson) : null;
  const [preset, setPreset] = useState(
    examFromLink
      ? { subjectId: examFromLink.subjectId, examId: examFromLink.id, topic: examFromLink.topics.find((topic) => topic.status !== "Dominado")?.title || "" }
      : lessonFromLink
        ? { subjectId: lessonFromLink.subjectId, lessonId: lessonFromLink.id }
        : subjectFromLink
          ? { subjectId: subjectFromLink }
          : {},
  );
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
