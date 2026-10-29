import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase, fileToBase64 } from "./api.js";

// Acompanhamento de uma transcrição, global ao app: o pedido segue no servidor (fila de IA) e o navegador
// guarda só o id do trabalho. Trocar de página ou recarregar não perde o andamento.
// O áudio original fica no aparelho (IndexedDB) até a pessoa salvar ou descartar o resultado,
// para permitir tentar de novo se a transcrição falhar. No servidor ele é apagado ao terminar, como antes.
const stateKey = "grimiau.transcricao";
const db = { name: "grimiau", store: "audios", key: "pendente" };

function openDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("sem IndexedDB"));
    const request = indexedDB.open(db.name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(db.store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function audioStore(mode, action) {
  const handle = await openDb();
  return new Promise((resolve, reject) => {
    const tx = handle.transaction(db.store, mode);
    const request = action(tx.objectStore(db.store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
  }).finally(() => handle.close());
}

const keepAudio = (audio) => audioStore("readwrite", (store) => store.put(audio, db.key)).catch(() => {});
export const readAudio = () => audioStore("readonly", (store) => store.get(db.key)).catch(() => null);
const dropAudio = () => audioStore("readwrite", (store) => store.delete(db.key)).catch(() => {});

function readState() {
  try {
    return JSON.parse(localStorage.getItem(stateKey) || "null");
  } catch {
    return null;
  }
}

function writeState(value) {
  try {
    if (value) localStorage.setItem(stateKey, JSON.stringify(value));
    else localStorage.removeItem(stateKey);
  } catch {
    // Sem armazenamento, o acompanhamento vale só enquanto a aba estiver aberta.
  }
}

export const activeStatuses = ["enviando", "pendente", "executando"];

export function useTranscription(session) {
  const [job, setJob] = useState(readState);
  const token = session?.token;
  const polling = useRef(false);

  const commit = useCallback((next) => {
    const value = typeof next === "function" ? next(readState()) : next;
    writeState(value);
    setJob(value);
  }, []);

  const submit = useCallback(
    async ({ blob, name, subjectId, date, subjectName }) => {
      if (activeStatuses.includes(readState()?.status)) throw new Error("Já existe uma transcrição em andamento. Aguarde ela terminar.");
      await keepAudio({ blob, name, type: blob.type });
      commit({ status: "enviando", fileName: name, size: blob.size, subjectId, date, subjectName: subjectName || "", startedAt: Date.now() });
      try {
        const response = await fetch(`${apiBase}/ai/transcribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ consent: true, mime: blob.type, data: await fileToBase64(blob), subject: subjectName || "" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.jobId) throw new Error(payload.error || "Não foi possível enviar o áudio.");
        commit((current) => ({ ...current, status: "pendente", jobId: payload.jobId }));
      } catch (error) {
        const message = error instanceof TypeError ? "Sem conexão com o servidor. Verifique a internet e tente de novo." : error.message;
        commit((current) => ({ ...current, status: "erro", error: message }));
      }
    },
    [token, commit],
  );

  // Consulta o servidor enquanto o trabalho não termina; retoma sozinho depois de recarregar a página.
  useEffect(() => {
    if (!token || !job?.jobId || !["pendente", "executando"].includes(job.status) || polling.current) return undefined;
    polling.current = true;
    let stopped = false;
    let failures = 0;
    const tick = async () => {
      if (stopped) return;
      try {
        const response = await fetch(`${apiBase}/ai/jobs/${job.jobId}`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json().catch(() => ({}));
        failures = 0;
        if (response.status === 404) return commit((current) => ({ ...current, status: "erro", error: "Este pedido expirou no servidor. Envie o áudio de novo." }));
        if (!response.ok) throw new Error(payload.error);
        if (payload.status === "pronto") return commit((current) => ({ ...current, status: "pronto", result: payload.result, finishedAt: Date.now() }));
        if (payload.status === "erro") return commit((current) => ({ ...current, status: "erro", error: payload.error || "A transcrição falhou." }));
        if (payload.status !== readState()?.status) commit((current) => ({ ...current, status: payload.status }));
      } catch {
        failures += 1;
      }
      if (!stopped) setTimeout(tick, failures ? 6000 : 3000);
    };
    tick();
    return () => {
      stopped = true;
      polling.current = false;
    };
  }, [token, job?.jobId, job?.status, commit]);

  const retry = useCallback(async () => {
    const audio = await readAudio();
    const current = readState();
    if (!audio?.blob) throw new Error("O áudio original não está mais neste aparelho. Importe o arquivo de novo.");
    commit(null);
    await submit({ blob: audio.blob, name: audio.name, subjectId: current?.subjectId, date: current?.date, subjectName: current?.subjectName });
  }, [commit, submit]);

  const clear = useCallback(async () => {
    await dropAudio();
    commit(null);
  }, [commit]);

  const updateResult = useCallback((result) => commit((current) => ({ ...current, result })), [commit]);

  return { job, submit, retry, clear, updateResult };
}
