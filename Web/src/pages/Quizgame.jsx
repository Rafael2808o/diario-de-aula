import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Crown, Plus, Swords, Trophy, X } from "lucide-react";
import { useApp } from "../context.js";
import { buildContext, SubjectTopicFields } from "../components/ai/shared.jsx";
import { PeoplePicker } from "../components/sala/People.jsx";
import { Avatar, Empty, FormError, Segmented } from "../ui.jsx";

// Perguntados: competição de perguntas entre amigos. As perguntas vêm do material de quem cria a partida e são
// geradas no servidor; o gabarito só aparece depois de cada resposta. O tempo é medido no servidor.
const statusLabel = { gerando: "Preparando perguntas", aberta: "Em andamento", encerrada: "Encerrada", erro: "Não deu certo" };
const seconds = (ms) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

function NewMatch({ onCreated, onCancel }) {
  const { data, call } = useApp();
  const [subjectId, setSubjectId] = useState(data.subjects[0]?.id || "");
  const [topic, setTopic] = useState("");
  const [people, setPeople] = useState([]);
  const [quantity, setQuantity] = useState("8");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = useMemo(() => buildContext(data, subjectId, topic), [data, subjectId, topic]);
  const subject = data.subjects.find((item) => item.id === subjectId);
  const thin = plan.context.length < 200;
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated(await call("/perguntados", { method: "POST", body: { subject: subject?.name, topic, context: plan.context, quantity: Number(quantity), userIds: people.map((person) => person.id) } }));
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  };
  if (!data.subjects.length) return <p className="hint">Cadastre uma disciplina e registre suas aulas para criar uma partida.</p>;
  return (
    <form className="paper-card form" onSubmit={submit}>
      <p className="paper-label">Nova partida</p>
      <SubjectTopicFields subjectId={subjectId} setSubjectId={setSubjectId} topic={topic} setTopic={setTopic} topicLabel="Conteúdo (opcional)" placeholder="Ex.: Segmentação de mercado" />
      <PeoplePicker value={people} onChange={setPeople} max={7} label="Convidar amigos" />
      <Segmented label="Quantidade de perguntas" value={quantity} onChange={setQuantity} options={["5", "8", "10"]} />
      <p className="hint">
        As perguntas saem das suas anotações e aulas desta disciplina (nível médio e avançado). Ninguém vê o gabarito antes de responder: nem você. Acerto vale 100 pontos + até 50 pela rapidez; erro tira 25.
      </p>
      {thin && <p className="notice">Há pouco material nesta disciplina{topic ? " sobre esse conteúdo" : ""}. Escreva no Caderno ou registre o que foi ensinado nas aulas para gerar boas perguntas.</p>}
      <FormError>{error}</FormError>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn primary" disabled={busy || thin || !people.length}>
          <Swords size={16} /> {busy ? "Criando..." : "Desafiar"}
        </button>
      </div>
    </form>
  );
}

function Ranking() {
  const { call } = useApp();
  const [state, setState] = useState(null);
  useEffect(() => {
    call("/perguntados/ranking").then(setState).catch(() => setState({ items: [], me: null }));
  }, [call]);
  if (!state) return <p className="quiet">Carregando…</p>;
  if (!state.items.length) return <p className="hint">Ninguém terminou uma partida ainda. O ranking soma os pontos de partidas com duas ou mais pessoas.</p>;
  return (
    <ol className="group quiz-ranking">
      {state.items.map((item) => (
        <li key={item.id} className={`row ${item.me ? "is-me" : ""}`}>
          <span className="quiz-position">{item.position}º</span>
          <Avatar user={item} size={30} />
          <span className="row-main">
            <strong>{item.me ? "Você" : item.name}</strong>
            <small>
              {item.wins} {item.wins === 1 ? "vitória" : "vitórias"} · {item.matches} {item.matches === 1 ? "partida" : "partidas"}
            </small>
          </span>
          <strong>{item.points} pts</strong>
        </li>
      ))}
      {state.me && !state.items.some((item) => item.me) && (
        <li className="row is-me">
          <span className="quiz-position">{state.me.position}º</span>
          <span className="row-main">
            <strong>Você</strong>
          </span>
          <strong>{state.me.points} pts</strong>
        </li>
      )}
    </ol>
  );
}

function Lobby() {
  const { call, go } = useApp();
  const [matches, setMatches] = useState(null);
  const [tab, setTab] = useState("Partidas");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    call("/perguntados").then(setMatches).catch(() => setMatches([]));
  }, [call]);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Perguntados</h1>
          <p>Desafie amigos com perguntas das suas aulas. Vence quem acertar mais e mais rápido.</p>
        </div>
        {!creating && (
          <div className="page-actions">
            <button className="btn primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> Nova partida
            </button>
          </div>
        )}
      </header>
      {creating && <NewMatch onCreated={(match) => go("perguntados", { id: match.id })} onCancel={() => setCreating(false)} />}
      <Segmented label="Ver" value={tab} onChange={setTab} options={["Partidas", "Ranking"]} />
      {tab === "Ranking" ? (
        <Ranking />
      ) : matches === null ? (
        <p className="quiet">Carregando…</p>
      ) : matches.length ? (
        <ul className="group">
          {matches.map((match) => (
            <li key={match.id} className="row">
              <button type="button" className="row-main row-link" onClick={() => go("perguntados", { id: match.id })}>
                <strong>
                  {match.subjectName}
                  {match.topic ? ` · ${match.topic}` : ""}
                </strong>
                <small>
                  {statusLabel[match.status]} · {match.players.filter((player) => !player.declined).map((player) => (player.me ? "você" : player.name)).join(", ")}
                </small>
              </button>
              {match.status === "aberta" && match.me && !match.me.finished && <span className="stamp gold">sua vez</span>}
              {match.winner && <span className="stamp mint">{match.winner.id === match.players.find((player) => player.me)?.id ? "você venceu" : `${match.winner.name} venceu`}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="hint">Nenhuma partida ainda. Crie uma e convide os amigos.</p>
      )}
    </div>
  );
}

function Play({ match, onDone }) {
  const { call, toast } = useApp();
  const [question, setQuestion] = useState(null);
  const [result, setResult] = useState(null);
  const [leftMs, setLeftMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const deadline = useRef(0);
  const load = useCallback(async () => {
    setResult(null);
    try {
      const next = await call(`/perguntados/${match.id}/pergunta`, { method: "POST" });
      deadline.current = Date.now() + next.leftMs;
      setLeftMs(next.leftMs);
      setQuestion(next);
    } catch (failure) {
      toast(failure.message);
      onDone();
    }
  }, [call, match.id, onDone, toast]);
  useEffect(() => {
    load();
  }, [load]);
  const answer = useCallback(
    async (choice) => {
      if (busy || result || !question) return;
      setBusy(true);
      try {
        setResult(await call(`/perguntados/${match.id}/resposta`, { method: "POST", body: { index: question.index, choice } }));
      } catch (failure) {
        toast(failure.message);
        onDone();
      } finally {
        setBusy(false);
      }
    },
    [busy, result, question, call, match.id, toast, onDone],
  );
  useEffect(() => {
    if (!question || result) return undefined;
    const timer = setInterval(() => {
      const left = Math.max(0, deadline.current - Date.now());
      setLeftMs(left);
      if (left === 0) answer(null);
    }, 200);
    return () => clearInterval(timer);
  }, [question, result, answer]);
  if (!question) return <p className="quiet">Preparando a pergunta…</p>;
  const total = question.secondsPerQuestion * 1000;
  return (
    <section className="paper-card quiz-play" aria-live="polite">
      <div className="quiz-play-head">
        <span className="paper-label">
          Pergunta {question.index + 1} de {question.total}
        </span>
        <strong>{result ? result.score : question.score} pts</strong>
      </div>
      <div className="quiz-timer" role="timer" aria-label={`${Math.ceil(leftMs / 1000)} segundos`}>
        <span style={{ width: `${result ? 0 : (leftMs / total) * 100}%` }} />
      </div>
      <h2 className="quiz-question">{question.question}</h2>
      <div className="quiz-options">
        {question.options.map((option, index) => {
          const state = !result ? "" : index === result.correctIndex ? "is-right" : index === result.choice ? "is-wrong" : "is-dim";
          return (
            <button key={index} type="button" className={`quiz-option ${state}`} disabled={Boolean(result) || busy} onClick={() => answer(index)}>
              <span className="quiz-letter">{"ABCD"[index]}</span> {option}
              {state === "is-right" && <Check size={16} aria-label="correta" />}
              {state === "is-wrong" && <X size={16} aria-label="sua resposta" />}
            </button>
          );
        })}
      </div>
      {result && (
        <div className="quiz-feedback">
          <p className={result.correct ? "quiz-right" : "quiz-wrong"}>
            {result.correct ? `Acertou! +${result.points} pts` : result.late ? "O tempo acabou. 0 pts" : `Errou. ${result.points} pts`}
          </p>
          {result.explanation && <p className="prewrap">{result.explanation}</p>}
          <button className="btn primary" onClick={() => (result.finished ? onDone() : load())}>
            {result.finished ? "Ver resultado" : "Próxima pergunta"}
          </button>
        </div>
      )}
    </section>
  );
}

function Match({ id }) {
  const { call, go, toast } = useApp();
  const [match, setMatch] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(() => call(`/perguntados/${id}`).then(setMatch).catch((failure) => setError(failure.message)), [call, id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (match?.status !== "gerando") return undefined;
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, [match?.status, load]);
  const stop = useCallback(() => {
    setPlaying(false);
    load();
  }, [load]);
  if (error && !match) {
    return (
      <div className="page">
        <Empty title="Partida indisponível" action={<button className="btn primary" onClick={() => go("perguntados")}>Ver partidas</button>}>
          {error}
        </Empty>
      </div>
    );
  }
  if (!match) return <div className="page"><p className="quiet">Carregando…</p></div>;
  const me = match.me;
  const podium = match.players.filter((player) => !player.declined);
  return (
    <div className="page quiz-page">
      <header className="page-head">
        <div>
          <button className="link-btn" onClick={() => go("perguntados")}>
            <ArrowLeft size={14} /> Perguntados
          </button>
          <h1>{match.subjectName}</h1>
          <p>
            {match.topic ? `${match.topic} · ` : ""}
            {match.total ? `${match.total} perguntas · ` : ""}
            {statusLabel[match.status]}
          </p>
        </div>
      </header>
      {playing ? (
        <Play match={match} onDone={stop} />
      ) : match.status === "gerando" ? (
        <p className="notice">A IA está montando as perguntas a partir das anotações. Leva alguns segundos.</p>
      ) : match.status === "erro" ? (
        <p className="notice">{match.error}</p>
      ) : (
        <>
          {match.status === "aberta" && me && !me.finished && !me.declined && (
            <section className="paper-card quiz-start">
              <p>
                {match.total} perguntas, {match.secondsPerQuestion} segundos cada. O relógio começa quando a pergunta aparece e não para se você sair da tela.
              </p>
              <div className="form-actions">
                {!match.owner && me.progress === 0 && (
                  <button
                    className="btn"
                    onClick={async () => {
                      try {
                        await call(`/perguntados/${id}/recusar`, { method: "POST" });
                        go("perguntados");
                      } catch (failure) {
                        toast(failure.message);
                      }
                    }}
                  >
                    Recusar
                  </button>
                )}
                <button className="btn primary" onClick={() => setPlaying(true)}>
                  <Swords size={16} /> {me.progress ? "Continuar" : "Começar"}
                </button>
              </div>
            </section>
          )}
          {match.winner && (
            <p className="quiz-winner">
              <Crown size={18} aria-hidden="true" /> {match.winner.id === match.players.find((player) => player.me)?.id ? "Você venceu!" : `${match.winner.name} venceu!`}
            </p>
          )}
          <section aria-label="Placar">
            <h2 className="section-title">
              <Trophy size={16} aria-hidden="true" /> Placar
            </h2>
            <ul className="group">
              {podium.map((player) => (
                <li key={player.id} className={`row ${player.me ? "is-me" : ""}`}>
                  <span className="quiz-position">{player.position ? `${player.position}º` : "–"}</span>
                  <Avatar user={player} size={30} />
                  <button type="button" className="row-main row-link" onClick={() => go("perfil", { pessoa: player.id })}>
                    <strong>{player.me ? "Você" : player.name}</strong>
                    <small>
                      {player.finished ? (player.score !== undefined ? `${player.correct} acertos · ${seconds(player.totalMs)}` : "Terminou") : `Respondeu ${player.progress} de ${match.total}`}
                    </small>
                  </button>
                  {player.score !== undefined && <strong>{player.score} pts</strong>}
                </li>
              ))}
            </ul>
            {match.status === "aberta" && me?.finished && <p className="hint">Esperando os outros terminarem (a partida fecha sozinha em até 48 h).</p>}
            {match.status === "aberta" && !me?.finished && <p className="hint">Os pontos dos outros aparecem quando você terminar.</p>}
          </section>
          {match.review.length > 0 && (
            <section aria-label="Revisão">
              <h2 className="section-title">Revisão das perguntas</h2>
              <ol className="quiz-review">
                {match.review.map((item, index) => (
                  <li key={index} className="paper-card">
                    <p>
                      <strong>{index + 1}.</strong> {item.question}
                    </p>
                    <p className={item.correct ? "quiz-right" : "quiz-wrong"}>
                      {item.choice === null ? "Sem resposta" : item.correct ? "Você acertou" : `Você marcou: ${item.options[item.choice]}`} · Correta: {item.options[item.correctIndex]}
                    </p>
                    {item.explanation && <p className="hint prewrap">{item.explanation}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </>
      )}
    </div>
  );
}

export default function Quizgame() {
  const { params } = useApp();
  return params.id ? <Match key={params.id} id={params.id} /> : <Lobby />;
}
