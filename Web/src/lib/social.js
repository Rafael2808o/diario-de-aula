import { useEffect, useState } from "react";
import { useApp } from "../context.js";
import { apiBase, fileToBase64 } from "./api.js";

// Peças comuns das áreas da Comunidade.
export const when = (iso) => {
  const date = new Date(iso);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

// Tempo que falta até expirar: "some em 5 h", "some em 20 min".
export const expiresIn = (iso) => {
  const minutes = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 60000));
  if (minutes < 60) return `some em ${minutes} min`;
  return `some em ${Math.round(minutes / 60)} h`;
};

export const authorUser = (author) => (author ? { id: author.id, name: author.name, avatarVersion: author.avatarVersion } : { id: "", name: "Um bruxinho", avatarVersion: "" });

export async function filePayload(file) {
  return { name: file.name, mime: file.type || "application/octet-stream", data: await fileToBase64(file) };
}

export const apiFileUrl = (path) => new URL(`${apiBase}${path}`, window.location.href).href;

// Marca a visita a uma área (para o indicador de novidades da Comunidade).
export function useMarkSeen(area) {
  const { call, setUser } = useApp();
  useEffect(() => {
    const timer = setTimeout(() => {
      call("/me", { method: "PATCH", body: { preferences: { communitySeen: { [area]: new Date().toISOString() } } } })
        .then(setUser)
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [area, call, setUser]);
}

// Papel da conta (admin, moderador, publicador ou vazio), lido uma vez por sessão.
let cachedRole = null;
export function useRole() {
  const { call, user } = useApp();
  const [role, setRole] = useState(cachedRole?.userId === user.id ? cachedRole.role : "");
  useEffect(() => {
    if (cachedRole?.userId === user.id) return;
    call("/me/role")
      .then((payload) => {
        cachedRole = { userId: user.id, role: payload.role || "" };
        setRole(cachedRole.role);
      })
      .catch(() => {});
  }, [call, user.id]);
  return role;
}

// Lista que se atualiza sozinha enquanto a página está visível (reações e respostas dos outros aparecem).
export function useLiveList(path, { every = 20_000 } = {}) {
  const { call } = useApp();
  const [state, setState] = useState({ status: "loading", items: [], error: "" });
  useEffect(() => {
    let alive = true;
    const load = () =>
      call(path)
        .then((items) => alive && setState({ status: "ready", items, error: "" }))
        .catch((failure) => alive && setState((current) => ({ ...current, status: current.items.length ? "ready" : "error", error: failure.message })));
    load();
    const timer = setInterval(() => document.visibilityState === "visible" && load(), every);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [call, path, every]);
  const replace = (item) => setState((current) => ({ ...current, items: current.items.map((other) => (other.id === item.id ? item : other)) }));
  const remove = (id) => setState((current) => ({ ...current, items: current.items.filter((other) => other.id !== id) }));
  const add = (item) => setState((current) => ({ ...current, items: [item, ...current.items] }));
  const reload = () => call(path).then((items) => setState({ status: "ready", items, error: "" }));
  return { ...state, replace, remove, add, reload };
}
