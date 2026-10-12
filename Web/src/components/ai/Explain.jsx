import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { useApp } from "../../context.js";
import { FormError } from "../../ui.jsx";
import { BasisHint, SourceNote, SubjectTopicFields, buildContext, postAi } from "./shared.jsx";

export default function Explain({ preset = {} }) {
  const { data, session } = useApp();
  const [subjectId, setSubjectId] = useState(preset.subjectId || data.subjects[0]?.id || "");
  const [topic, setTopic] = useState(preset.topic || "");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState({});
  const plan = useMemo(() => buildContext(data, subjectId, topic), [data, subjectId, topic]);
  const subject = data.subjects.find((item) => item.id === subjectId);

  const ask = async (level) => {
    if (!topic.trim()) return setError("Escreva o que você não entendeu.");
    setLoading(level);
    setError("");
    setRevealed({});
    try {
      const payload = await postAi(session, "/ai/study", { tool: "explicar", subject: subject.name, topic, level, context: plan.context });
      setResult({ ...payload, level, notes: plan.sources, generic: plan.generic });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading("");
    }
  };

  return (
    <div className="tool-body">
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          ask("simples");
        }}
      >
        <SubjectTopicFields subjectId={subjectId} setSubjectId={setSubjectId} topic={topic} setTopic={setTopic} topicLabel="O que você não entendeu?" topicRequired placeholder="Ex.: por que o preto vira K no CMYK" />
        <BasisHint plan={plan} />
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button className="btn primary" disabled={Boolean(loading)}>
            <Sparkles size={16} /> {loading === "simples" ? "Explicando..." : "Explicar"}
          </button>
        </div>
      </form>
      {result && (
        <section className="ai-result" aria-live="polite">
          <SourceNote sources={result.notes} generic={result.generic} />
          <p className="explanation-text">{result.explanation}</p>
          {result.examples.length > 0 && (
            <>
              <h4>Exemplos</h4>
              <ul className="plain-list">
                {result.examples.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            </>
          )}
          {result.check.length > 0 && (
            <>
              <h4>Confira se entendeu</h4>
              <ul className="check-questions">
                {result.check.map((item, index) => (
                  <li key={item.question}>
                    <span>{item.question}</span>
                    {revealed[index] ? (
                      <p>{item.answer}</p>
                    ) : (
                      <button className="link-btn" onClick={() => setRevealed((current) => ({ ...current, [index]: true }))}>
                        Ver resposta
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {result.gaps.length > 0 && <p className="hint">Faltou no seu material: {result.gaps.join(" ")}</p>}
          <div className="form-actions">
            <button className="btn small" disabled={Boolean(loading)} onClick={() => ask("resumida")}>
              {loading === "resumida" ? "Resumindo..." : "Mais curto"}
            </button>
            <button className="btn small" disabled={Boolean(loading)} onClick={() => ask("detalhada")}>
              {loading === "detalhada" ? "Detalhando..." : "Mais detalhado"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
