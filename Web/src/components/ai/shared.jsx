import { useEffect, useState } from "react";
import { useApp } from "../../context.js";
import { apiBase } from "../../lib/api.js";
import { formatFull } from "../../lib/dates.js";
import { Empty } from "../../ui.jsx";

const normalize = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Reúne os registros da disciplina como texto rotulado pela origem, para a IA citar de onde veio cada ponto.
// Com assunto informado, prioriza as aulas que o mencionam; sem nenhuma, usa todas as aulas da disciplina.
export function buildContext(data, subjectId, topic = "", limit = 6000) {
  const term = normalize(topic.trim());
  const lessons = data.lessons.filter((lesson) => lesson.subjectId === subjectId && lesson.status !== "cancelada");
  const matches = (texts) => !term || texts.some((text) => normalize(text).includes(term));
  const relevant = lessons.filter((lesson) => matches([lesson.theme, lesson.taught, lesson.notes, lesson.examInfo, lesson.missedContent, lesson.transcript]));
  const chosen = relevant.length ? relevant : lessons;
  const notes = data["teacher-notes"].filter((note) => note.subjectId === subjectId);
  const materials = data.materials.filter((material) => material.subjectId === subjectId && material.notes);
  const blocks = [
    ...chosen.map((lesson) => ({
      label: `Aula de ${formatFull(lesson.date)}${lesson.theme ? `: ${lesson.theme}` : ""}`,
      text: [lesson.taught, lesson.missedContent, lesson.notes, lesson.examInfo && `Sobre a prova: ${lesson.examInfo}`].filter(Boolean).join("\n"),
    })),
    ...notes.map((note) => ({ label: `Cofre do professor, ${note.informedOn ? formatFull(note.informedOn) : "sem data"} (${note.confirmation})`, text: note.content })),
    ...materials.map((material) => ({ label: `Material: ${material.title}`, text: material.notes })),
  ].filter((block) => block.text);
  let context = "";
  const sources = [];
  for (const block of blocks) {
    const piece = `[${block.label}]\n${block.text}\n\n`;
    if (context.length + piece.length > limit) break;
    context += piece;
    sources.push(block.label);
  }
  return { context: context.trim(), sources, generic: Boolean(term) && !relevant.length && lessons.length > 0 };
}

export function useAiStatus() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    fetch(`${apiBase}/ai/status`)
      .then((response) => response.json())
      .then(setStatus)
      .catch(() => setStatus({ configured: false }));
  }, []);
  return status;
}

export function AiUnavailable() {
  return (
    <Empty title="A IA não está configurada no servidor.">
      Para usar esta ferramenta, a variável GEMINI_API_KEY precisa estar definida na API. Nada é gerado sem ela.
    </Empty>
  );
}

// Seletor de disciplina + assunto com sugestões vindas dos temas das aulas e dos assuntos das provas.
export function SubjectTopicFields({ subjectId, setSubjectId, topic, setTopic, topicLabel = "Assunto", topicRequired = false, placeholder = "Ex.: Modelo CMYK" }) {
  const { data } = useApp();
  const suggestions = [
    ...new Set([
      ...data.exams.filter((exam) => exam.subjectId === subjectId).flatMap((exam) => exam.topics.map((item) => item.title)),
      ...data.lessons.filter((lesson) => lesson.subjectId === subjectId && lesson.theme).map((lesson) => lesson.theme),
    ]),
  ];
  return (
    <div className="form-row">
      <label>
        Disciplina
        <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
          {data.subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {topicLabel}
        <input value={topic} required={topicRequired} onChange={(event) => setTopic(event.target.value)} maxLength={180} placeholder={placeholder} list={`topics-${subjectId}`} />
        <datalist id={`topics-${subjectId}`}>
          {suggestions.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </label>
    </div>
  );
}

export function SourceNote({ sources, generic }) {
  return (
    <p className="source-note">
      <strong>Gerado pela IA a partir dos seus registros. Não é orientação do professor.</strong>{" "}
      {sources.length ? `Fontes: ${sources.slice(0, 6).join("; ")}${sources.length > 6 ? " e outras" : ""}.` : "Nenhum registro seu foi usado: confira com o material da disciplina."}
      {generic ? " Nenhuma aula cita esse assunto diretamente; usamos todas as aulas da disciplina." : ""}
    </p>
  );
}

export function BasisHint({ plan }) {
  return (
    <p className="hint">
      {plan.sources.length
        ? `Vai usar ${plan.sources.length} ${plan.sources.length === 1 ? "registro seu" : "registros seus"} como base.`
        : "Você ainda não tem registros nesta disciplina. A IA vai responder só com conhecimento geral, e isso será indicado."}
    </p>
  );
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Envia o pedido e acompanha o trabalho até a IA terminar. Transcrições podem levar alguns minutos.
export async function postAi(session, path, body) {
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` };
  const response = await fetch(`${apiBase}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "A IA não respondeu agora.");
  if (!payload.jobId) return payload;
  // Prazos acima do pior caso do servidor, que encerra trabalhos presos em 11 minutos.
  const deadline = Date.now() + (path.includes("transcribe") ? 11.5 * 60_000 : 4 * 60_000);
  let delay = 1200;
  let failures = 0;
  while (Date.now() < deadline) {
    await wait(delay);
    delay = Math.min(delay + 400, 3000);
    let poll;
    try {
      poll = await fetch(`${apiBase}/ai/jobs/${payload.jobId}`, { headers });
      failures = 0;
    } catch (error) {
      // Uma queda rápida de conexão não perde o pedido; só desiste depois de várias falhas seguidas.
      failures += 1;
      if (failures >= 4) throw error;
      continue;
    }
    const job = await poll.json().catch(() => ({}));
    if (!poll.ok) throw new Error(job.error || "Não foi possível acompanhar o pedido.");
    if (job.status === "pronto") return job.result;
    if (job.status === "erro") throw new Error(job.error || "A IA não respondeu agora.");
  }
  throw new Error("A IA está demorando mais que o normal. Tente de novo em instantes.");
}
