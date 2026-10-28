import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "../../context.js";
import { todayIso } from "../../lib/dates.js";
import { FormError } from "../../ui.jsx";
import { ProgressRing } from "../Art.jsx";
import { BasisHint, SourceNote, SubjectTopicFields, buildContext, postAi, AiProgress } from "./shared.jsx";

export default function Quiz({ preset = {}, mode = "praticar" }) {
  const { data, session, create, toast } = useApp();
  const [subjectId, setSubjectId] = useState(preset.subjectId || data.subjects[0]?.id || "");
  const [topic, setTopic] = useState(preset.topic || "");
  const [quantity, setQuantity] = useState(5);
  const [difficulty, setDifficulty] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState(null);
  const [result, setResult] = useState(null);
  const [answers, setAnswers] = useState({});
  const [saved, setSaved] = useState(false);
  const plan = useMemo(() => buildContext(data, subjectId, topic), [data, subjectId, topic]);
  const subject = data.subjects.find((item) => item.id === subjectId);

  const generate = async (event) => {
    event.preventDefault();
    if (!subject || !topic.trim()) return setError("Escolha a disciplina e informe o assunto do simulado.");
    setLoading(true);
    setError("");
    setStage(null);
    setResult(null);
    setAnswers({});
    setSaved(false);
    try {
      const payload = await postAi(session, "/ai/questions", { subject: subject.name, topic, context: plan.context, quantity, difficulty }, setStage);
      setResult({ ...payload, sources: plan.sources, generic: plan.generic });
    } catch (failure) {
      setError(failure instanceof TypeError ? "Não foi possível conectar ao servidor." : failure.message);
    } finally {
      setLoading(false);
    }
  };

  const answer = async (index, option) => {
    const next = { ...answers, [index]: option };
    setAnswers(next);
    // Ao responder a última questão, o resultado vai para o histórico com os erros, para a revisão final.
    if (Object.keys(next).length === result.questions.length && !saved) {
      setSaved(true);
      const mistakes = result.questions
        .map((question, position) => ({ question, chosen: next[position] }))
        .filter(({ question, chosen }) => chosen !== question.correctIndex)
        .map(({ question, chosen }) => ({ question: question.question, chosen: question.options[chosen], correct: question.options[question.correctIndex], explanation: question.explanation }));
      try {
        await create("quiz-results", {
          subjectId,
          examId: preset.examId || null,
          topic,
          total: result.questions.length,
          correct: result.questions.length - mistakes.length,
          takenOn: todayIso(),
          mistakes,
        });
        toast("Resultado salvo no seu histórico.");
      } catch (failure) {
        setSaved(false);
        toast(`O resultado não foi salvo: ${failure.message}`);
      }
    }
  };

  return (
    <div className="tool-body">
      <form className="form" onSubmit={generate}>
        <SubjectTopicFields subjectId={subjectId} setSubjectId={setSubjectId} topic={topic} setTopic={setTopic} topicRequired />
        <div className="form-row">
          <label>
            Quantidade de questões
            <select value={quantity} onChange={(event) => setQuantity(Number(event.target.value))}>
              {[3, 5, 8, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dificuldade
            <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
              <option value="">Misturada</option>
              <option>Fácil</option>
              <option>Média</option>
              <option>Avançada</option>
            </select>
          </label>
        </div>
        <BasisHint plan={plan} />
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button className="btn primary" disabled={loading}>
            <Sparkles size={16} /> {loading ? "Gerando questões..." : mode === "simulado" ? "Gerar simulado" : "Gerar questões"}
          </button>
        </div>
      </form>
      {Boolean(loading) && <AiProgress kind="questoes" stage={stage} />}

      {result && (
        <QuestionRunner
          key={result.title + result.questions.length}
          result={result}
          mode={mode}
          answers={answers}
          onAnswer={answer}
          onRestart={() => {
            setResult(null);
            setAnswers({});
            setSaved(false);
          }}
        />
      )}
    </div>
  );
}

const clock = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

// Uma questão por vez. No modo praticar, a correção aparece na hora; no simulado, só no fim, com o tempo correndo.
function QuestionRunner({ result, mode, answers, onAnswer, onRestart }) {
  const total = result.questions.length;
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [started] = useState(Date.now);
  const [now, setNow] = useState(Date.now);
  const [finishedAt, setFinishedAt] = useState(null);
  useEffect(() => {
    if (finishedAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [finishedAt]);
  const seconds = Math.round(((finishedAt || now) - started) / 1000);
  const question = result.questions[index];
  const locked = answers[index] !== undefined;
  const correct = result.questions.filter((item, position) => answers[position] === item.correctIndex).length;

  const confirm = () => {
    if (picked === null || locked) return;
    onAnswer(index, picked);
    if (mode === "simulado") advance();
  };
  const advance = () => {
    setPicked(null);
    if (index + 1 >= total) {
      setFinishedAt(Date.now());
      setIndex(total);
    } else setIndex(index + 1);
  };

  if (index >= total) {
    const wrong = result.questions.map((item, position) => ({ item, chosen: answers[position] })).filter(({ item, chosen }) => chosen !== item.correctIndex);
    return (
      <section className="quiz-result" aria-live="polite">
        <h3>Seu resultado</h3>
        <div className="quiz-score">
          <ProgressRing value={(correct / total) * 100} size={104} label={`${correct} de ${total} certas`}>
            {correct}/{total}
          </ProgressRing>
          <dl>
            <div>
              <dt>Acertos</dt>
              <dd className="ok">{correct}</dd>
            </div>
            <div>
              <dt>Erros</dt>
              <dd className="bad">{total - correct}</dd>
            </div>
            <div>
              <dt>Tempo</dt>
              <dd>{clock(seconds)}</dd>
            </div>
          </dl>
        </div>
        {wrong.length ? (
          <>
            <h4>Para revisar</h4>
            <ul className="group">
              {wrong.map(({ item, chosen }) => (
                <li key={item.question} className="row review-row">
                  <span className="row-main">
                    <strong>{item.question}</strong>
                    <small>
                      {chosen !== undefined ? `Você marcou: ${item.options[chosen]}. ` : ""}Certa: {item.options[item.correctIndex]}
                    </small>
                    {item.explanation && <small>{item.explanation}</small>}
                  </span>
                </li>
              ))}
            </ul>
            <p className="hint">As questões erradas também aparecem na revisão final da prova e no histórico.</p>
          </>
        ) : (
          <p className="quiet">Tudo certo. Nada para revisar desta vez.</p>
        )}
        <div className="form-actions">
          <button className="btn primary" onClick={onRestart}>
            Gerar outras questões
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="question-runner" aria-live="polite">
      <SourceNote sources={result.sources} generic={result.generic} />
      <div className="runner-head">
        <strong>
          {mode === "simulado" ? `${index + 1} / ${total}` : `Questão ${index + 1} de ${total}`}
        </strong>
        {mode === "simulado" && <span className="runner-clock">{clock(seconds)}</span>}
      </div>
      <div className="xp-track" role="progressbar" aria-label="Progresso" aria-valuemin={0} aria-valuemax={total} aria-valuenow={index + 1}>
        <span style={{ width: `${((index + (locked ? 1 : 0)) / total) * 100}%` }} />
      </div>
      <article className="question solo" key={index}>
        <h4>{question.question}</h4>
        <div className="options" role="group" aria-label={`Alternativas da questão ${index + 1}`}>
          {question.options.map((option, optionIndex) => {
            const chosen = (locked ? answers[index] : picked) === optionIndex;
            const right = optionIndex === question.correctIndex;
            const reveal = locked && mode === "praticar";
            return (
              <button
                type="button"
                key={optionIndex}
                disabled={locked}
                aria-pressed={chosen}
                className={`${chosen ? "chosen" : ""} ${reveal && right ? "right" : ""} ${reveal && chosen && !right ? "wrong" : ""}`}
                onClick={() => setPicked(optionIndex)}
              >
                <b>{String.fromCharCode(65 + optionIndex)}</b>
                <span>{option}</span>
                {reveal && right && <em>Correta</em>}
                {reveal && chosen && !right && <em>Sua resposta</em>}
              </button>
            );
          })}
        </div>
        {locked && mode === "praticar" && (
          <p className="explanation">
            <strong>{answers[index] === question.correctIndex ? "Certo." : "Ainda não."}</strong> {question.explanation}
          </p>
        )}
      </article>
      <div className="form-actions runner-actions">
        {locked && mode === "praticar" ? (
          <button className="btn primary" onClick={advance}>
            {index + 1 >= total ? "Ver resultado" : "Próxima questão"}
          </button>
        ) : (
          <button className="btn primary" disabled={picked === null} onClick={confirm}>
            {mode === "simulado" ? (index + 1 >= total ? "Responder e terminar" : "Responder e seguir") : "Responder"}
          </button>
        )}
      </div>
    </section>
  );
}
