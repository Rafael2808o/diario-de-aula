import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Download, Layers, Mic, NotebookPen, Pause, Play, RotateCcw, Square, Trash2, Upload } from "lucide-react";
import { useApp } from "../../context.js";
import { todayIso, weekdayOf } from "../../lib/dates.js";
import { formatElapsed } from "../../lib/recorder.js";
import { activeStatuses } from "../../lib/transcription.js";
import { FormError, Nox, Segmented } from "../../ui.jsx";
import { saveLesson } from "../LessonForm.jsx";

const maxBytes = 3 * 1024 * 1024;

// Etapas reais do pedido no servidor. O serviço não informa progresso: a porcentagem e o tempo restante
// são estimativas pelo tamanho do áudio e pela etapa atual, e param em 95% até a resposta chegar.
export const stageText = {
  enviando: ["Enviando o áudio", "O arquivo está indo para o servidor."],
  pendente: ["Áudio recebido", "O pedido chegou e aguarda a vez de ser processado."],
  executando: ["Transcrevendo e resumindo", "A IA está escrevendo a transcrição e o resumo. Você pode navegar pelo app: o andamento continua."],
  pronto: ["Transcrição pronta", "Confira o texto antes de guardar no registro da aula."],
  erro: ["A transcrição falhou", "O áudio original continua guardado neste aparelho."],
};

// Tempo típico: cerca de 25 s fixos mais 45 s por MB de áudio (medido nos testes com o Gemini).
export function transcriptionEstimate(job, now) {
  const expected = 25 + ((job.size || 1_000_000) / 1_048_576) * 45;
  const elapsed = Math.max(0, (now - job.startedAt) / 1000);
  const floor = job.status === "executando" ? 25 : job.status === "pendente" ? 10 : 2;
  const percent = job.status === "pronto" ? 100 : Math.min(95, Math.max(floor, Math.round(95 * (1 - Math.exp(-elapsed / (expected * 0.6))))));
  return { percent, remaining: Math.round(expected - elapsed) };
}

function elapsedLabel(job, now) {
  const seconds = Math.max(0, Math.round(((job.finishedAt || now) - job.startedAt) / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

export function TranscriptionStatus({ job, onRetry, onClear, compact = false }) {
  const [now, setNow] = useState(Date.now);
  const active = activeStatuses.includes(job.status);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  const [title, text] = stageText[job.status] || stageText.pendente;
  const steps = ["enviando", "pendente", "executando", "pronto"];
  const reached = steps.indexOf(job.status);
  const estimate = transcriptionEstimate(job, now);
  return (
    <div className={`transcription-status status-${job.status} ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <div className="transcription-head">
        {job.status === "pronto" ? <CheckCircle2 size={22} aria-hidden="true" /> : job.status === "erro" ? <AlertCircle size={22} aria-hidden="true" /> : <Nox size={36} mood="focused" alive />}
        <div>
          <strong>
            {active ? (estimate.percent > 80 ? "Quase lá" : "Seu grimório está sendo preparado") : title}
            {active && <span className="transcription-percent"> {estimate.percent}%</span>}
          </strong>
          <small>
            {job.fileName}
            {job.size ? `, ${Math.round(job.size / 1024)} KB` : ""} · {active ? "há " : "levou "}
            {elapsedLabel(job, now)}
          </small>
        </div>
      </div>
      {!compact && <p>{job.status === "erro" && job.error ? `${job.error} ${stageText.erro[1]}` : text}</p>}
      {active && (
        <>
          <div className="xp-track" aria-hidden="true">
            <span className="ai-progress-bar" style={{ width: `${estimate.percent}%` }} />
          </div>
          {!compact && <small className="hint">{estimate.remaining > 3 ? `Cerca de ${estimate.remaining < 90 ? `${estimate.remaining} s` : `${Math.round(estimate.remaining / 60)} min`} restantes (estimativa).` : "Está levando um pouco mais que o normal. Pode continuar usando o app."}</small>}
        </>
      )}
      {!compact && job.status !== "erro" && (
        <ol className="transcription-steps" aria-label="Etapas da transcrição">
          {steps.map((step, index) => (
            <li key={step} className={index < reached ? "done" : index === reached ? "current" : ""} aria-current={index === reached ? "step" : undefined}>
              {stageText[step][0]}
            </li>
          ))}
        </ol>
      )}
      {job.status === "erro" && !compact && (
        <div className="form-actions">
          <button type="button" className="btn ghost" onClick={onClear}>
            Descartar
          </button>
          <button type="button" className="btn primary" onClick={onRetry}>
            <RotateCcw size={15} /> Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}

// Uma parte de áudio pronta (gravada ou importada): ouvir, baixar ou mandar transcrever.
function AudioPart({ part, label, sent, disabled, onTranscribe }) {
  const url = useMemo(() => URL.createObjectURL(part.blob), [part.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const extension = part.blob.type.includes("mp4") ? "m4a" : part.blob.type.includes("ogg") ? "ogg" : "webm";
  return (
    <li className="audio-part">
      <div className="audio-part-head">
        <strong>{label}</strong>
        <small>
          {Math.max(1, Math.round(part.size / 1024))} KB{sent ? " · já enviada para transcrição" : ""}
        </small>
      </div>
      <audio controls src={url} className="audio-preview" />
      <div className="form-actions">
        <a className="btn ghost small" href={url} download={`${part.name}.${extension}`}>
          <Download size={14} /> Baixar áudio
        </a>
        <button type="button" className="btn primary small" disabled={disabled} onClick={onTranscribe}>
          {sent ? "Transcrever de novo" : "Transcrever e resumir"}
        </button>
      </div>
    </li>
  );
}

export default function Transcribe() {
  const app = useApp();
  const { data, toast, transcription, recorder, params } = app;
  const job = transcription.job;
  const [consent, setConsent] = useState(false);
  const [view, setView] = useState("resumo");
  const [imported, setImported] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState([]);
  const result = job?.status === "pronto" ? job.result : null;
  // Disciplina e data vêm do que a pessoa escolheu (ou do link da aula); nunca da primeira disciplina da lista.
  const knownSubject = (id) => (data.subjects.some((item) => item.id === id) ? id : "");
  const [subjectId, setSubjectId] = useState(() => knownSubject(params.subject || recorder.context?.subjectId || ""));
  const [date, setDate] = useState(() => (/^\d{4}-\d{2}-\d{2}$/.test(params.date || "") ? params.date : recorder.context?.date || todayIso()));
  const [resultSubjectId, setResultSubjectId] = useState(() => knownSubject(job?.subjectId || ""));
  const [resultDate, setResultDate] = useState(job?.date || todayIso());
  const [, tick] = useState(0);
  useEffect(() => {
    if (!recorder.active) return undefined;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recorder.active]);
  // Quando um resultado chega, o formulário de destino começa no contexto da gravação.
  useEffect(() => {
    if (job?.status !== "pronto") return;
    setResultSubjectId(knownSubject(job.subjectId || ""));
    setResultDate(job.date || todayIso());
  }, [job?.status, job?.jobId]);

  const subjectOf = (id) => data.subjects.find((item) => item.id === id);
  const context = { subjectId, date, subjectName: subjectOf(subjectId)?.name || "" };
  const changeContext = (next) => {
    if (next.subjectId !== undefined) setSubjectId(next.subjectId);
    if (next.date !== undefined) setDate(next.date);
    // Com gravação em andamento, a correção vale para ela também.
    if (recorder.status !== "idle") recorder.setContext({ ...context, ...next, subjectName: subjectOf(next.subjectId ?? subjectId)?.name || "" });
  };

  const start = async () => {
    setError("");
    setSent([]);
    try {
      await recorder.start(context);
    } catch (failure) {
      setError(failure.message);
    }
  };

  const transcribe = async (part, key) => {
    setBusy(true);
    setError("");
    try {
      const subject = subjectOf(subjectId);
      // Sem disciplina escolhida, a IA não recebe nome de matéria nenhum: o assunto sai só do áudio.
      await transcription.submit({ blob: part.blob, name: part.name, subjectId: subject ? subjectId : "", date, subjectName: subject?.name || "" });
      setSent((list) => [...new Set([...list, key])]);
      if (key === "importado") setImported(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const saveToLesson = async () => {
    const subject = subjectOf(resultSubjectId);
    if (!subject) return setError("Escolha a disciplina desta aula antes de salvar.");
    const lesson = data.lessons.find((item) => item.subjectId === resultSubjectId && item.date === resultDate);
    const summary = result.summary;
    const lines = [
      summary.concepts.length && `Conceitos: ${summary.concepts.join("; ")}`,
      summary.examples.length && `Exemplos: ${summary.examples.join("; ")}`,
      summary.guidance.length && `Orientações: ${summary.guidance.join("; ")}`,
    ].filter(Boolean);
    setBusy(true);
    setError("");
    try {
      await saveLesson(app, { subject, date: resultDate, start: lesson?.startTime || subject.schedule.find((slot) => slot.day === weekdayOf(resultDate))?.start || "", lesson: lesson || null }, {
        status: "presente",
        theme: lesson?.theme || summary.subject,
        taught: [lesson?.taught, lines.join("\n")].filter(Boolean).join("\n\n"),
        examInfo: [lesson?.examInfo, summary.exam.join("\n")].filter(Boolean).join("\n"),
        notes: [lesson?.notes, summary.doubts.length && `Dúvidas e pontos a revisar: ${summary.doubts.join("; ")}`].filter(Boolean).join("\n"),
        // Uma aula pode ter várias partes: a transcrição nova entra depois da que já existia.
        transcript: [lesson?.transcript, result.transcript].filter(Boolean).join("\n\n"),
        draft: true,
      });
      toast(`Aula salva em ${subject.name}, como rascunho para você revisar.`);
      setSaved(resultSubjectId);
      await transcription.clear();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const running = job && activeStatuses.includes(job.status);
  const savedSubject = subjectOf(saved);
  const recordingSubject = subjectOf(recorder.context?.subjectId);

  return (
    <div className="tool-body">
      <div className="consent">
        <strong>Você tem autorização para gravar esta aula?</strong>
        <p>
          Grave só quando o professor e a instituição permitirem. A gravação pode captar a voz de outras pessoas: avise a turma. O áudio é enviado ao Gemini
          para transcrição e apagado do servidor quando termina. Até você guardar ou descartar o resultado, uma cópia fica só neste aparelho, para tentar de novo se algo falhar.
        </p>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Tenho autorização
        </label>
      </div>

      <fieldset className="record-context">
        <legend>De qual aula é este áudio?</legend>
        <div className="form-row">
          <label className="form">
            Disciplina
            <select value={subjectId} onChange={(event) => changeContext({ subjectId: event.target.value })}>
              <option value="">Escolher depois</option>
              {data.subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="form">
            Data da aula
            <input type="date" value={date} onChange={(event) => changeContext({ date: event.target.value })} />
          </label>
        </div>
        <small className="hint">{subjectId ? "A transcrição já sai ligada a esta disciplina. Dá para corrigir antes de salvar." : "Sem disciplina, a transcrição fica aguardando você confirmar a aula antes de salvar."}</small>
      </fieldset>

      {recorder.active ? (
        <div className={`recorder is-recording ${recorder.status === "paused" ? "is-paused" : ""}`}>
          <p className="recorder-state">
            <span className="rec-dot" aria-hidden="true" /> {recorder.status === "paused" ? "Pausado" : "Gravando"}
            {recordingSubject ? ` · ${recordingSubject.name}` : ""}
          </p>
          <p className="recorder-clock" role="timer">
            {formatElapsed(recorder.elapsed())}
          </p>
          <Nox size={64} mood={recorder.status === "paused" ? "sleepy" : "focused"} alive={recorder.status !== "paused"} />
          <div className="recorder-actions">
            <button className="btn" onClick={recorder.status === "paused" ? recorder.resume : recorder.pause}>
              {recorder.status === "paused" ? <Play size={16} /> : <Pause size={16} />} {recorder.status === "paused" ? "Continuar" : "Pausar"}
            </button>
            <button className="btn danger" onClick={recorder.stop}>
              <Square size={14} /> Finalizar
            </button>
          </div>
          <p className="hint">Pode navegar pela Grimiau, abrir materiais e anotar: a gravação continua e o controle fica no topo da tela. Não feche esta aba.</p>
        </div>
      ) : (
        recorder.status !== "done" && (
          <div className="recorder">
            <button className="mic-button" disabled={!consent} onClick={start} aria-label="Começar a gravar">
              <Mic size={30} aria-hidden="true" />
            </button>
            <p className="hint">{consent ? "Toque para começar" : "Marque a autorização para liberar o microfone"}</p>
            <label className={`btn ghost small ${!consent ? "is-disabled" : ""}`}>
              <Upload size={15} /> Importar áudio gravado
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                disabled={!consent}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  if (file.size > maxBytes) return setError("O arquivo precisa ter até 3 MB. Divida a gravação em partes menores.");
                  setError("");
                  setImported({ blob: file, name: file.name.replace(/\.[^.]+$/, ""), size: file.size });
                }}
              />
            </label>
          </div>
        )
      )}

      {recorder.status === "done" && recorder.parts.length > 0 && (
        <section className="recorded-parts">
          <h3>{recorder.recovered ? "Gravação recuperada deste aparelho" : "Gravação finalizada"}</h3>
          <p className="hint">
            {recorder.recovered ? "Uma gravação foi interrompida antes de terminar (aba fechada, sessão expirada ou falha do navegador). O áudio que chegou a ser gravado está aqui." : "O áudio fica guardado neste aparelho até você descartar."}
            {recorder.parts.length > 1 ? " A aula foi dividida em partes de até 3 MB para caber na transcrição: envie uma de cada vez." : ""}
          </p>
          <ul className="audio-parts">
            {recorder.parts.map((part, index) => (
              <AudioPart
                key={part.name}
                part={part}
                label={recorder.parts.length > 1 ? `Parte ${index + 1}` : "Áudio da aula"}
                sent={sent.includes(part.name)}
                disabled={busy || !consent || running}
                onTranscribe={() => transcribe(part, part.name)}
              />
            ))}
          </ul>
          {!consent && <p className="hint">Marque a autorização acima para transcrever.</p>}
          {running && <p className="hint">Aguarde a transcrição em andamento terminar para enviar outra parte.</p>}
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => recorder.discard()}>
              <Trash2 size={14} /> Descartar gravação
            </button>
          </div>
        </section>
      )}

      {imported && (
        <ul className="audio-parts">
          <AudioPart part={imported} label={imported.name} disabled={busy || !consent || running} onTranscribe={() => transcribe(imported, "importado")} />
        </ul>
      )}
      <FormError>{error || recorder.error}</FormError>
      {job && job.status !== "pronto" && (
        <TranscriptionStatus job={job} onClear={() => transcription.clear()} onRetry={() => transcription.retry().catch((failure) => setError(failure.message))} />
      )}
      {running && <p className="hint">Pode sair desta página. Um aviso no topo mostra o andamento, e o resultado espera por você aqui.</p>}

      {savedSubject && !job && (
        <section className="saved-next">
          <strong>Aula guardada em {savedSubject.name}.</strong>
          <p>Quer transformar o conteúdo em estudo?</p>
          <div className="form-actions">
            <button className="btn soft" onClick={() => app.go("ia", { tool: "flashcards", subject: savedSubject.id })}>
              <Layers size={15} /> Criar Cartas do Saber
            </button>
            <button className="btn soft" onClick={() => app.go("ia", { tool: "questoes", subject: savedSubject.id })}>
              <NotebookPen size={15} /> Praticar questões
            </button>
          </div>
        </section>
      )}
      {result && (
        <section className="ai-result">
          <TranscriptionStatus job={job} compact />
          <p className="source-note">
            <strong>Transcrição automática. Confira antes de usar.</strong> Trechos marcados como [trecho incerto] não foram entendidos.
          </p>
          <Segmented
            label="Resultado da aula"
            value={view}
            onChange={setView}
            options={[
              ["resumo", "Resumo"],
              ["transcricao", "Transcrição"],
            ]}
          />
          {view === "transcricao" && (
            <label className="form">
              Transcrição (editável)
              <textarea rows={12} value={result.transcript} onChange={(event) => transcription.updateResult({ ...result, transcript: event.target.value })} />
            </label>
          )}
          {view === "resumo" && (
            <dl className="summary-grid">
              {[
                ["Assunto identificado no áudio", result.summary.subject ? [result.summary.subject] : []],
                ["Conceitos", result.summary.concepts],
                ["Exemplos do professor", result.summary.examples],
                ["Atividades e orientações", result.summary.guidance],
                ["Sobre provas", result.summary.exam],
                ["Dúvidas e pontos a revisar", result.summary.doubts],
              ].map(([label, items]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{items.length ? items.join("; ") : "Não aparece no áudio."}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="hint">O assunto acima é o que a IA ouviu na aula. A disciplina é a que você confirma aqui embaixo.</p>
          <div className="form-row">
            <label className="form">
              Disciplina da aula
              <select value={resultSubjectId} onChange={(event) => setResultSubjectId(event.target.value)}>
                <option value="">Escolha a disciplina</option>
                {data.subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form">
              Data da aula
              <input type="date" value={resultDate} onChange={(event) => setResultDate(event.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => transcription.clear()}>
              Descartar
            </button>
            <button className="btn primary" disabled={busy || !resultSubjectId} onClick={saveToLesson}>
              Salvar no Grimório
            </button>
          </div>
          <p className="hint">Vai para o registro da aula desta disciplina e data, como rascunho, sem apagar o que já estava escrito.</p>
        </section>
      )}
    </div>
  );
}
