import { useEffect, useState } from "react";
import { readSession, request } from "./api.js";

// Loja da Madrugada no aparelho: moldura de cada pessoa (buscada em lote, uma chamada para várias fotos)
// e a cor do app comprada no Pacote Aurora.

const frames = new Map(); // userId -> nome da moldura ("" = sem moldura)
const listeners = new Set();
let pending = new Set();
let timer = null;

const notify = () => listeners.forEach((listener) => listener());

function flush() {
  timer = null;
  const ids = [...pending].filter((id) => !frames.has(id));
  pending = new Set();
  const token = readSession()?.token;
  if (!ids.length || !token) return;
  ids.forEach((id) => frames.set(id, ""));
  request(`/loja/molduras?ids=${ids.map(encodeURIComponent).join(",")}`, { token })
    .then((found) => {
      for (const [id, frame] of Object.entries(found || {})) frames.set(id, frame);
      notify();
    })
    .catch(() => ids.forEach((id) => frames.delete(id)));
}

export function setOwnFrame(userId, itemId) {
  frames.set(userId, String(itemId || "").replace(/^moldura-/, ""));
  notify();
}

export function useFrame(userId) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!userId) return undefined;
    const listener = () => setTick((tick) => tick + 1);
    listeners.add(listener);
    if (!frames.has(userId)) {
      pending.add(userId);
      timer ||= window.setTimeout(flush, 30);
    }
    return () => listeners.delete(listener);
  }, [userId]);
  return userId ? frames.get(userId) || "" : "";
}

export const appColorChoices = [
  ["", "Crepúsculo", "#8d70b8"],
  ["aurora", "Aurora", "#4fb3b0"],
  ["alvorada", "Alvorada", "#d97aa6"],
  ["brasa", "Brasa", "#e0895a"],
  ["musgo", "Musgo", "#6fae7a"],
];

const colorKey = "grimiau.cor";
export function applyAppColor(color) {
  const root = document.documentElement;
  if (color) root.dataset.accent = color;
  else root.removeAttribute("data-accent");
  try {
    localStorage.setItem(colorKey, color || "");
  } catch {
    // Sem armazenamento, a cor volta na próxima carga da loja.
  }
}

// Formata pozinho como no resto do Brasil: 1.450.
export const dust = (value) => Number(value || 0).toLocaleString("pt-BR");
