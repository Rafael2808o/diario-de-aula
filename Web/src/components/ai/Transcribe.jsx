import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Layers, Mic, NotebookPen, Pause, Play, RotateCcw, Square, Upload } from "lucide-react";
import { useApp } from "../../context.js";
import { todayIso, weekdayOf } from "../../lib/dates.js";
import { activeStatuses } from "../../lib/transcription.js";
import { FormError, Nox, Segmented } from "../../ui.jsx";
import { saveLesson } from "../LessonForm.jsx";

const maxBytes = 3 * 1024 * 1024;
const pickMime = () => ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";

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

export default function Transcribe() {
  const app = useApp();
  const { data, toast, transcription } = app;
  const job = transcription.job;
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [view, setView] = useState("resumo");
  const [seconds, setSeconds] = useState(0);
  const [audio, setAudio] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
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
      setPaused(false);
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
    setPaused(false);
  };

  const togglePause = () => {
    const media = recorder.current;
    if (!media) return;
    if (paused) {
      media.resume();
      timer.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } else {
      media.pause();
      clearInterval(timer.current);
    }
    setPaused(!paused);
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
      toast("Aula salva no Grimório, como rascunho para você revisar.");
      setSaved(subjectId);
      await transcription.clear();
      setAudio(null);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const running = job && activeStatuses.includes(job.status);
  const savedSubject = data.subjects.find((item) => item.id === saved);

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

      {!job && (
        <>
          <div className={`recorder ${recording ? "is-recording" : ""} ${paused ? "is-paused" : ""}`}>
            {recording ? (
              <>
                <p className="recorder-state">
                  <span className="rec-dot" aria-hidden="true" /> {paused ? "Pausado" : "Gravando"}
                </p>
                <p className="recorder-clock" role="timer">
                  {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                </p>
                <Nox size={64} mood={paused ? "sleepy" : "focused"} alive={!paused} />
                <div className="recorder-actions">
                  <button className="btn" onClick={togglePause}>
                    {paused ? <Play size={16} /> : <Pause size={16} />} {paused ? "Continuar" : "Pausar"}
                  </button>
                  <button className="btn danger" onClick={stop}>
                    <Square size={14} /> Finalizar
                  </button>
                </div>
              </>
            ) : (
              <>
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
                      setAudio({ blob: file, name: file.name, size: file.size });
                    }}
                  />
                </label>
              </>
            )}
          </div>
          {audio && !recording && (
            <p className="hint">
              {audio.name}, {Math.round(audio.size / 1024)} KB
            </p>
          )}
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
          )}
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
              Salvar no Grimório
            </button>
          </div>
          <p className="hint">Vai para o registro da aula desta disciplina e data, como rascunho, sem apagar o que já estava escrito.</p>
        </section>
      )}
    </div>
  );
}
