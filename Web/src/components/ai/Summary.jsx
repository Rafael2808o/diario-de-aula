import { useMemo, useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { useApp } from "../../context.js";
import { FormError, Segmented } from "../../ui.jsx";
import { BasisHint, SourceNote, SubjectTopicFields, buildContext, postAi } from "./shared.jsx";

const depths = [
  ["rapida", "Revisão rápida"],
  ["completa", "Resumo completo"],
  ["essencial", "Conceitos essenciais"],
];

export default function Summary({ preset = {} }) {
  const { data, session, toast } = useApp();
  const [subjectId, setSubjectId] = useState(preset.subjectId || data.subjects[0]?.id || "");
  const [topic, setTopic] = useState(preset.topic || "");
  const [depth, setDepth] = useState("rapida");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const plan = useMemo(() => buildContext(data, subjectId, topic), [data, subjectId, topic]);
  const subject = data.subjects.find((item) => item.id === subjectId);

  const generate = async (event) => {
    event.preventDefault();
    if (!plan.sources.length) return setError("Registre ao menos uma aula desta disciplina: o resumo é feito a partir das suas anotações.");
    setLoading(true);
    setError("");
    try {
      const payload = await postAi(session, "/ai/study", { tool: "resumo", subject: subject.name, topic, depth, context: plan.context });
      setResult({ ...payload, sources: plan.sources, generic: plan.generic });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  };

  // O resultado é editável: o aluno corrige direto no texto antes de copiar.
  const copy = async () => {
    const text = [result.title, ...result.points.map((point) => `${point.heading ? `${point.heading}: ` : ""}${point.text}`)].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("Resumo copiado.");
    } catch {
      toast("Não foi possível copiar. Selecione o texto manualmente.");
    }
  };

  return (
    <div className="tool-body">
      <form className="form" onSubmit={generate}>
        <SubjectTopicFields subjectId={subjectId} setSubjectId={setSubjectId} topic={topic} setTopic={setTopic} topicLabel="Assunto (opcional)" placeholder="Deixe vazio para resumir todas as aulas" />
        <Segmented label="Profundidade" value={depth} onChange={setDepth} options={depths} />
        <BasisHint plan={plan} />
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button className="btn primary" disabled={loading}>
            <Sparkles size={16} /> {loading ? "Resumindo..." : "Resumir"}
          </button>
        </div>
      </form>
      {result && (
        <section className="ai-result" aria-live="polite">
          <header>
            <h3 contentEditable suppressContentEditableWarning>
              {result.title}
            </h3>
            <button className="btn small" onClick={copy}>
              <Copy size={14} /> Copiar
            </button>
          </header>
          <SourceNote sources={result.sources} generic={result.generic} />
          <ol className="summary-points">
            {result.points.map((point, index) => (
              <li key={index}>
                {point.heading && <strong contentEditable suppressContentEditableWarning>{point.heading}</strong>}
                <p contentEditable suppressContentEditableWarning>
                  {point.text}
                </p>
                {point.source && <small>Fonte: {point.source}</small>}
              </li>
            ))}
          </ol>
          {result.gaps.length > 0 && (
            <div className="gaps">
              <strong>O que faltou no seu material</strong>
              <ul>
                {result.gaps.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="footnote">Você pode clicar no texto para corrigir antes de copiar.</p>
        </section>
      )}
    </div>
  );
}
