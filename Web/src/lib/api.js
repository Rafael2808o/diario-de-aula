import { useCallback, useEffect, useState } from "react";

export const apiBase =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3333/api/v1" : "/api/v1");

// Mantém a mesma chave do app anterior para não desconectar quem já estava logado.
export const sessionKey = "estuda.session";

export function readSession() {
  try {
    return JSON.parse(localStorage.getItem(sessionKey) || "null");
  } catch {
    return null;
  }
}

export function storeSession(session) {
  try {
    if (session) localStorage.setItem(sessionKey, JSON.stringify(session));
    else localStorage.removeItem(sessionKey);
  } catch {
    // Navegação privada pode bloquear o armazenamento; a sessão segue só na memória.
  }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export const readableError = (error, fallback = "Algo deu errado. Tente novamente.") =>
  error instanceof TypeError || error?.message === "Failed to fetch"
    ? "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente."
    : error?.message || fallback;

export async function request(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(payload.error || "Não foi possível concluir a ação.", response.status);
  return payload;
}

export const collections = ["subjects", "lessons", "exams", "tasks", "events", "teacher-notes", "materials", "flashcards", "quiz-results", "files", "study-plans", "diaries", "study-sessions"];

// Carrega todas as coleções da conta e expõe operações que só alteram o estado local depois que a API confirma.
export function useAcademicData(session, onExpired) {
  const token = session?.token;
  const [data, setData] = useState(() => Object.fromEntries(collections.map((name) => [name, []])));
  const [status, setStatus] = useState("idle");

  const load = useCallback(async () => {
    if (!token) return;
    setStatus("loading");
    try {
      const results = await Promise.all(collections.map((name) => request(`/${name}`, { token })));
      setData(Object.fromEntries(collections.map((name, index) => [name, results[index]])));
      setStatus("ready");
    } catch (error) {
      if (error.status === 401) onExpired();
      else setStatus("error");
    }
  }, [token, onExpired]);

  useEffect(() => {
    load();
  }, [load]);

  const call = useCallback(
    async (path, options) => {
      try {
        return await request(path, { token, ...options });
      } catch (error) {
        if (error.status === 401) onExpired();
        throw error;
      }
    },
    [token, onExpired],
  );

  const create = useCallback(
    async (name, body) => {
      const item = await call(`/${name}`, { method: "POST", body });
      setData((current) => ({ ...current, [name]: [...current[name], item] }));
      return item;
    },
    [call],
  );

  const update = useCallback(
    async (name, id, body) => {
      const item = await call(`/${name}/${id}`, { method: name === "subjects" ? "PUT" : "PATCH", body });
      setData((current) => ({ ...current, [name]: current[name].map((entry) => (entry.id === id ? item : entry)) }));
      return item;
    },
    [call],
  );

  // A exclusão no servidor pode remover ou desvincular registros relacionados; recarregar mantém a tela fiel ao banco.
  const remove = useCallback(
    async (name, id, { reload = false } = {}) => {
      await call(`/${name}/${id}`, { method: "DELETE" });
      setData((current) => ({
        ...current,
        [name]: current[name].filter((entry) => entry.id !== id),
        ...(name === "materials" ? { files: current.files.filter((file) => file.materialId !== id) } : {}),
      }));
      if (reload) await load();
    },
    [call, load],
  );

  const replace = useCallback((name, items) => setData((current) => ({ ...current, [name]: items })), []);

  return { data, status, load, call, create, update, remove, replace };
}

// Lê um arquivo do aparelho como base64 (sem o prefixo data:) para enviar à API.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    reader.readAsDataURL(file);
  });
}

// Arquivos abrem por um link de uso único (2 minutos) gerado pela API, sem o token da sessão na URL.
// No app Android, a navegação para esse link é interceptada e abre no navegador do aparelho.
export async function openStoredFile(token, file) {
  const insideApp = Boolean(window.LUMINA_APP);
  const preview = insideApp ? null : window.open("", "_blank");
  try {
    const { ticket } = await request(`/files/${file.id}/ticket`, { token, method: "POST" });
    const url = new URL(`${apiBase}/files/download/${ticket}`, window.location.href).href;
    if (insideApp) window.location.href = url;
    else if (preview) preview.location.href = url;
    else window.location.href = url;
  } catch (error) {
    preview?.close();
    throw new Error(error.message || "Não foi possível abrir o arquivo.");
  }
}
