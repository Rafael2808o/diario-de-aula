import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Mic, RotateCcw, Square, Upload } from "lucide-react";
import { useApp } from "../../context.js";
import { todayIso, weekdayOf } from "../../lib/dates.js";
import { activeStatuses } from "../../lib/transcription.js";
import { FormError, Nox } from "../../ui.jsx";
import { saveLesson } from "../LessonForm.jsx";

const maxBytes = 3 * 1024 * 1024;
const pickMime = () => ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";

// Etapas reais do pedido no servidor. Não há porcentagem nem previsão de tempo: o serviço não informa progresso.
export const stageText = {
  enviando: ["Enviando o áudio", "O arquivo está indo para o servidor."],
  pendente: ["Na fila", "O pedido chegou e aguarda a vez de ser processado."],
  executando: ["Transcrevendo", "Estamos transcrevendo sua aula. O tempo varia com a duração do áudio e com a fila. Você pode navegar pelo app: o andamento continua."],
  pronto: ["Transcrição pronta", "Confira o texto antes de guardar no registro da aula."],
  erro: ["A transcrição falhou", "O áudio original continua guardado neste aparelho."],
};

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
  return (
    <div className={`transcription-status status-${job.status} ${compact ? "compact" : ""}`} role="status" aria-live="polite">
      <div className="transcription-head">
        {job.status === "pronto" ? <CheckCircle2 size={22} aria-hidden="true" /> : job.status === "erro" ? <AlertCircle size={22} aria-hidden="true" /> : <Nox size={36} mood="focused" alive />}
        <div>
          <strong>{title}</strong>
          <small>
            {job.fileName}
            {job.size ? `, ${Math.round(job.size / 1024)} KB` : ""} · {active ? "há " : "levou "}
            {elapsedLabel(job, now)}
          </small>
        </div>
      </div>
      {!compact && <p>{job.status === "erro" && job.error ? `${job.error} ${stageText.erro[1]}` : text}</p>}
      {active && <div className="indeterminate" aria-hidden="true" />}
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

export default function Transcribe() {
  const app = useApp();
  const { data, toast, transcription } = app;
  const job = transcription.job;
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const result = job?.status === "pronto" ? job.result : null;
  const [subjectId, setSubjectId] = useState(job?.subjectId || data.subjects[0]?.id || "");
  const [date, setDate] = useState(job?.date || todayIso());
  const recorder = useRef(null);
  const timer = useRef(null);
  const audioUrl = useMemo(() => (audio ? URL.createObjectURL(audio.blob) : ""), [audio]);
  useEffect(() => () => audioUrl && URL.revokeObjectURL(audioUrl), [audioUrl]);

  useEffect(() => () => {
    clearInterval(timer.current);
    recorder.current?.stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return setError("Este navegador não grava áudio. Importe um arquivo gravado no celular.");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const media = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24_000 });
      const chunks = [];
      media.ondataavailable = (event) => event.data.size && chunks.push(event.data);
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: (media.mimeType || mime || "audio/webm").split(";")[0] });
        if (blob.size > maxBytes) setError("A gravação passou de 3 MB. Grave trechos menores (cerca de 15 minutos cada).");
        else setAudio({ blob, name: `gravacao-${todayIso()}`, size: blob.size });
      };
      media.start(1000);
      recorder.current = media;
      setRecording(true);
      setSeconds(0);
      timer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setError("O navegador não liberou o microfone. Verifique a permissão do site.");
    }
  };

  const stop = () => {
    recorder.current?.stop();
    clearInterval(timer.current);
    setRecording(false);
  };

  const transcribe = async () => {
    setBusy(true);
    setError("");
    try {
      const subject = data.subjects.find((item) => item.id === subjectId);
      await transcription.submit({ blob: audio.blob, name: audio.name, subjectId, date, subjectName: subject?.name || "" });
      setAudio(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const saveToLesson = async () => {
    const subject = data.subjects.find((item) => item.id === subjectId);
    if (!subject) return setError("Escolha a disciplina da aula.");
    const lesson = data.lessons.find((item) => item.subjectId === subjectId && item.date === date);
    const summary = result.summary;
    const lines = [
      summary.concepts.length && `Conceitos: ${summary.concepts.join("; ")}`,
      summary.examples.length && `Exemplos: ${summary.examples.join("; ")}`,
      summary.guidance.length && `Orientações: ${summary.guidance.join("; ")}`,
    ].filter(Boolean);
    setBusy(true);
    try {
      await saveLesson(app, { subject, date, start: lesson?.startTime || subject.schedule.find((slot) => slot.day === weekdayOf(date))?.start || "", lesson: lesson || null }, {
        status: "presente",
        theme: lesson?.theme || summary.subject,
        taught: [lesson?.taught, lines.join("\n")].filter(Boolean).join("\n\n"),
        examInfo: [lesson?.examInfo, summary.exam.join("\n")].filter(Boolean).join("\n"),
        notes: [lesson?.notes, summary.doubts.length && `Dúvidas e pontos a revisar: ${summary.doubts.join("; ")}`].filter(Boolean).join("\n"),
        transcript: result.transcript,
        draft: true,
      });
      toast("Transcrição guardada no registro da aula, como rascunho para você revisar.");
      await transcription.clear();
      setAudio(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const running = job && activeStatuses.includes(job.status);

  return (
    <div className="tool-body">
      <div className="consent">
        <p>
          Grave só quando o professor e a instituição permitirem. A gravação pode captar a voz de outras pessoas: avise a turma. O áudio é enviado ao Gemini
          para transcrição e apagado do servidor quando termina. Até você guardar ou descartar o resultado, uma cópia fica só neste aparelho, para tentar de novo se algo falhar.
        </p>
        <label className="check">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> Tenho autorização para gravar esta aula.
        </label>
      </div>

      {!job && (
        <>
          <div className="record-bar">
            {recording ? (
              <button className="btn danger" onClick={stop}>
                <Square size={15} /> Parar ({Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")})
              </button>
            ) : (
              <button className="btn primary" disabled={!consent} onClick={start}>
                <Mic size={16} /> Gravar
              </button>
            )}
            <label className={`btn ${!consent ? "is-disabled" : ""}`}>
              <Upload size={16} /> Importar áudio
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
                  setAudio({ blob: file, name: file.name, size: file.size });
                }}
              />
            </label>
            {audio && !recording && (
              <span className="hint">
                {audio.name}, {Math.round(audio.size / 1024)} KB
              </span>
            )}
          </div>
          {audio && !recording && <audio controls src={audioUrl} className="audio-preview" />}
        </>
      )}
      <FormError>{error}</FormError>
      {audio && !recording && !job && (
        <div className="form-actions">
          <button className="btn primary" disabled={busy || !consent} onClick={transcribe}>
            {busy ? "Enviando..." : "Transcrever e resumir"}
          </button>
        </div>
      )}
      {job && job.status !== "pronto" && (
        <TranscriptionStatus job={job} onClear={() => transcription.clear()} onRetry={() => transcription.retry().catch((failure) => setError(failure.message))} />
      )}
      {running && <p className="hint">Pode sair desta página. Um aviso no topo mostra o andamento, e o resultado espera por você aqui.</p>}

      {result && (
        <section className="ai-result">
          <TranscriptionStatus job={job} compact />
          <p className="source-note">
            <strong>Transcrição automática. Confira antes de usar.</strong> Trechos marcados como [trecho incerto] não foram entendidos.
          </p>
          <label className="form">
            Transcrição (editável)
            <textarea rows={10} value={result.transcript} onChange={(event) => transcription.updateResult({ ...result, transcript: event.target.value })} />
          </label>
          <dl className="summary-grid">
            {[
              ["Assunto principal", result.summary.subject ? [result.summary.subject] : []],
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
          <div className="form-row">
            <label className="form">
              Disciplina
              <select value={subjectId} onChange={(event) => setSubjectId(event.target.value)}>
                {data.subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="form">
              Data da aula
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn" onClick={() => transcription.clear()}>
              Descartar
            </button>
            <button className="btn primary" disabled={busy || !data.subjects.length} onClick={saveToLesson}>
              Guardar no registro da aula
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
