import { useCallback, useEffect, useRef, useState } from "react";
import { todayIso } from "./dates.js";

// Gravação de aula global ao app: o MediaRecorder vive no Shell, não na página onde a gravação começou,
// então navegar pela Grimiau não interrompe a captura. Cada segundo de áudio vai para o IndexedDB do aparelho:
// se a aba fechar, o navegador travar ou a sessão expirar, o que foi gravado pode ser recuperado depois.
// Perto de 3 MB (limite do envio para transcrição), a gravação fecha uma parte e começa a próxima sem parar.
// Fechar o navegador, bloquear o microfone ou o sistema suspender a aba ainda interrompem a captura:
// isso não depende da Grimiau, e o que já foi gravado continua salvo.

const dbName = "grimiau-gravacao";
const storeName = "trechos";
const contextKey = "grimiau.gravacao";
export const partLimit = 2_800_000;
const pickMime = () => ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"].find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("sem IndexedDB"));
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName, { autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, action) {
  const handle = await openDb();
  return new Promise((resolve, reject) => {
    const tx = handle.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  }).finally(() => handle.close());
}

const saveChunk = (chunk) => withStore("readwrite", (store) => store.add(chunk)).catch(() => {});
const readChunks = () => withStore("readonly", (store) => store.getAll()).catch(() => []);
const clearChunks = () => withStore("readwrite", (store) => store.clear()).catch(() => {});

function readContext() {
  try {
    return JSON.parse(localStorage.getItem(contextKey) || "null");
  } catch {
    return null;
  }
}
function writeContext(value) {
  try {
    if (value) localStorage.setItem(contextKey, JSON.stringify(value));
    else localStorage.removeItem(contextKey);
  } catch {
    // Sem armazenamento, a disciplina escolhida vale só enquanto a aba estiver aberta.
  }
}

// Junta os trechos guardados em partes tocáveis (uma por segmento do MediaRecorder).
function partsFrom(chunks, context) {
  const groups = new Map();
  for (const chunk of chunks) {
    const group = groups.get(chunk.part) || { type: chunk.type, blobs: [] };
    group.blobs.push(chunk.blob);
    groups.set(chunk.part, group);
  }
  const date = context?.date || todayIso();
  return [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, group], index, all) => {
      const blob = new Blob(group.blobs, { type: (group.type || "audio/webm").split(";")[0] });
      return { blob, size: blob.size, name: `gravacao-${date}${all.length > 1 ? `-parte-${index + 1}` : ""}` };
    })
    .filter((part) => part.size > 0);
}

export const formatElapsed = (ms) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
};

export function useRecorder() {
  // status: idle | recording | paused | done (partes prontas para ouvir, transcrever ou baixar)
  const [status, setStatus] = useState("idle");
  const [context, setContextState] = useState(readContext);
  const [parts, setParts] = useState([]);
  const [error, setError] = useState("");
  const [recovered, setRecovered] = useState(false);
  const [clock, setClock] = useState({ base: 0, since: 0 });
  const media = useRef(null);
  const stream = useRef(null);
  const part = useRef(0);
  const partBytes = useRef(0);
  const finishing = useRef(false);

  // Gravação interrompida (aba fechada, sessão expirada): os trechos continuam no aparelho.
  useEffect(() => {
    readChunks().then((chunks) => {
      if (!chunks.length) return;
      const recoveredParts = partsFrom(chunks, readContext());
      if (!recoveredParts.length) return;
      setParts(recoveredParts);
      setStatus("done");
      setRecovered(true);
    });
  }, []);

  const elapsed = useCallback((now = Date.now()) => clock.base + (clock.since ? now - clock.since : 0), [clock]);

  const setContext = useCallback((value) => {
    writeContext(value);
    setContextState(value);
  }, []);

  // Começa um segmento novo no mesmo microfone (cada parte precisa do próprio cabeçalho de áudio).
  const startSegment = useCallback(() => {
    const mime = pickMime();
    const recorder = new MediaRecorder(stream.current, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24_000 });
    const index = part.current;
    partBytes.current = 0;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      partBytes.current += event.data.size;
      saveChunk({ part: index, type: recorder.mimeType || mime || "audio/webm", blob: event.data });
      // Fecha a parte antes do limite e emenda a próxima, sem a pessoa precisar fazer nada.
      if (partBytes.current >= partLimit && recorder.state === "recording" && !finishing.current) {
        part.current += 1;
        recorder.stop();
        startSegment();
      }
    };
    recorder.onerror = () => setError("O navegador interrompeu a gravação. O que já foi gravado está salvo neste aparelho.");
    recorder.start(1000);
    media.current = recorder;
  }, []);

  const start = useCallback(
    async (nextContext) => {
      setError("");
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error("Este navegador não grava áudio. Importe um arquivo gravado no celular.");
      try {
        stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        throw new Error("O navegador não liberou o microfone. Verifique a permissão do site.");
      }
      // Se o microfone for desligado pelo sistema, a gravação para e o que foi gravado fica guardado.
      stream.current.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (media.current && media.current.state !== "inactive") {
            setError("O microfone foi desligado pelo sistema ou pelo navegador. O que foi gravado até aqui está salvo.");
            stopAll();
          }
        };
      });
      await clearChunks();
      setParts([]);
      setRecovered(false);
      setContext(nextContext);
      part.current = 0;
      finishing.current = false;
      startSegment();
      setClock({ base: 0, since: Date.now() });
      setStatus("recording");
    },
    [setContext, startSegment],
  );

  const pause = useCallback(() => {
    if (media.current?.state !== "recording") return;
    media.current.pause();
    setClock((current) => ({ base: current.base + (Date.now() - current.since), since: 0 }));
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (media.current?.state !== "paused") return;
    media.current.resume();
    setClock((current) => ({ ...current, since: Date.now() }));
    setStatus("recording");
  }, []);

  // Finaliza: espera o último trecho chegar ao IndexedDB e monta as partes.
  const stopAll = useCallback(async () => {
    const recorder = media.current;
    if (!recorder) return;
    finishing.current = true;
    setClock((current) => ({ base: current.base + (current.since ? Date.now() - current.since : 0), since: 0 }));
    if (recorder.state !== "inactive") {
      await new Promise((resolve) => {
        recorder.addEventListener("stop", resolve, { once: true });
        recorder.stop();
      });
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
    // Dá tempo ao último saveChunk terminar.
    await new Promise((resolve) => setTimeout(resolve, 150));
    setParts(partsFrom(await readChunks(), readContext()));
    setStatus("done");
  }, []);

  const discard = useCallback(async () => {
    const recorder = media.current;
    if (recorder && recorder.state !== "inactive") {
      finishing.current = true;
      await new Promise((resolve) => {
        recorder.addEventListener("stop", resolve, { once: true });
        recorder.stop();
      });
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
    await clearChunks();
    setParts([]);
    setRecovered(false);
    setClock({ base: 0, since: 0 });
    setStatus("idle");
    setContext(null);
  }, [setContext]);

  // Avisa antes de fechar ou recarregar a aba com gravação em andamento ou partes ainda não usadas.
  useEffect(() => {
    if (status === "idle") return undefined;
    const guard = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [status]);

  useEffect(() => () => stream.current?.getTracks().forEach((track) => track.stop()), []);

  return { status, active: status === "recording" || status === "paused", context, setContext, parts, error, setError, recovered, elapsed, start, pause, resume, stop: stopAll, discard };
}
