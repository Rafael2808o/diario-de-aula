import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "../../context.js";
import { todayIso } from "../../lib/dates.js";
import { FormError } from "../../ui.jsx";
import { BasisHint, SourceNote, SubjectTopicFields, buildContext, postAi } from "./shared.jsx";

export default function Quiz({ preset = {} }) {
  const { data, session, create, toast } = useApp();
  const [subjectId, setSubjectId] = useState(preset.subjectId || data.subjects[0]?.id || "");
  const [topic, setTopic] = useState(preset.topic || "");
  const [quantity, setQuantity] = useState(5);
  const [difficulty, setDifficulty] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
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
    setResult(null);
    setAnswers({});
    setSaved(false);
    try {
      const payload = await postAi(session, "/ai/questions", { subject: subject.name, topic, context: plan.context, quantity, difficulty });
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

  const correct = result ? result.questions.filter((question, index) => answers[index] === question.correctIndex).length : 0;
  const answered = Object.keys(answers).length;
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
            <Sparkles size={16} /> {loading ? "Gerando questões..." : "Gerar simulado"}
          </button>
        </div>
      </form>

      {result && (
        <section className="question-set" aria-live="polite">
          <header>
            <h3>{result.title}</h3>
            <span className="badge">{answered ? `${correct} de ${answered} certas` : `${result.questions.length} questões`}</span>
          </header>
          <SourceNote sources={result.sources} generic={result.generic} />
          {result.questions.map((question, index) => {
            const done = answers[index] !== undefined;
            return (
              <article className="question" key={`${question.question}-${index}`}>
                <span className="question-number">{index + 1}</span>
                <div>
                  <h4>{question.question}</h4>
                  <div className="options" role="group" aria-label={`Alternativas da questão ${index + 1}`}>
                    {question.options.map((option, optionIndex) => {
                      const chosen = answers[index] === optionIndex;
                      const right = optionIndex === question.correctIndex;
                      return (
                        <button
                          type="button"
                          key={optionIndex}
                          disabled={done}
                          className={`${chosen ? "chosen" : ""} ${done && right ? "right" : ""} ${done && chosen && !right ? "wrong" : ""}`}
                          onClick={() => answer(index, optionIndex)}
                        >
                          <b>{String.fromCharCode(65 + optionIndex)}</b>
                          <span>{option}</span>
                          {done && right && <em>Correta</em>}
                          {done && chosen && !right && <em>Sua resposta</em>}
                        </button>
                      );
                    })}
                  </div>
                  {done && (
                    <p className="explanation">
                      <strong>{answers[index] === question.correctIndex ? "Certo." : "Ainda não."}</strong> {question.explanation}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
          {answered === result.questions.length && (
            <p className="result-line">
              Você acertou {correct} de {result.questions.length}. {correct < result.questions.length ? "As questões erradas aparecem na revisão final da prova e no histórico." : "Tudo certo neste simulado."}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
