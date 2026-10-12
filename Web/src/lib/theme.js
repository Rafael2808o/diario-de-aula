// Aparência é preferência do aparelho: fica no navegador e é aplicada antes da primeira pintura (ver index.html).
const themeKey = "lumina.theme";
const accentKey = "lumina.accent";

export const themes = [
  ["sistema", "Automático"],
  ["claro", "Claro"],
  ["escuro", "Escuro"],
];
export const accents = [
  ["lavanda", "Lavanda", "#4f5bd5"],
  ["azul", "Azul", "#2d6bd6"],
  ["lilas", "Lilás", "#8a46b8"],
];

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

export const currentTheme = () => read(themeKey, "sistema");
export const currentAccent = () => read(accentKey, "lavanda");

export function applyAppearance(theme = currentTheme(), accent = currentAccent()) {
  const root = document.documentElement;
  if (theme === "sistema") root.removeAttribute("data-theme");
  else root.dataset.theme = theme === "escuro" ? "dark" : "light";
  root.dataset.accent = accent;
  try {
    localStorage.setItem(themeKey, theme);
    localStorage.setItem(accentKey, accent);
  } catch {
    // Sem armazenamento, a escolha vale até fechar a aba.
  }
}
