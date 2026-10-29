import { useEffect, useState } from "react";
import { Mic, Pause, Play, Square } from "lucide-react";
import { useApp } from "../context.js";
import { formatElapsed } from "../lib/recorder.js";

// Controle da gravação no topo, em todas as páginas: tempo, pausar/continuar e finalizar.
export default function RecordingBar() {
  const { recorder, data, go, page, params } = useApp();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!recorder.active) return undefined;
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [recorder.active]);
  const onRecorder = page === "ia" && params.tool === "gravar";
  if (recorder.status === "done" && !onRecorder) {
    return (
      <button type="button" className="recording-bar is-done" onClick={() => go("ia", { tool: "gravar" })}>
        <Mic size={15} aria-hidden="true" /> Gravação guardada: transcrever ou baixar
      </button>
    );
  }
  if (!recorder.active) return null;
  const paused = recorder.status === "paused";
  const subject = data.subjects.find((item) => item.id === recorder.context?.subjectId);
  return (
    <div className={`recording-bar ${paused ? "is-paused" : ""}`} role="group" aria-label="Gravação em andamento">
      <button type="button" className="recording-open" onClick={() => go("ia", { tool: "gravar" })} title="Abrir a gravação">
        <span className="rec-dot" aria-hidden="true" />
        <span className="recording-time" role="timer" aria-label={`${paused ? "Pausada" : "Gravando"}: ${formatElapsed(recorder.elapsed())}`}>
          {formatElapsed(recorder.elapsed())}
        </span>
        {subject && <span className="recording-subject">{subject.name}</span>}
      </button>
      <button type="button" className="icon-btn" aria-label={paused ? "Continuar gravação" : "Pausar gravação"} onClick={paused ? recorder.resume : recorder.pause}>
        {paused ? <Play size={15} /> : <Pause size={15} />}
      </button>
      <button type="button" className="icon-btn danger" aria-label="Finalizar gravação" onClick={recorder.stop}>
        <Square size={13} />
      </button>
    </div>
  );
}
