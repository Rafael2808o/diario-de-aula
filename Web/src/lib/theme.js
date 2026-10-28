// Aparência é preferência do aparelho: fica no navegador e é aplicada antes da primeira pintura (ver index.html).
// A Grimiau nasce no tema escuro (Noite Mística); o claro (Névoa Lunar) é opcional.
const themeKey = "grimiau.theme";

export const themes = [
  ["escuro", "Noite Mística"],
  ["claro", "Névoa Lunar"],
];

const read = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

// Quem escolheu o tema claro no Lúmina (chave antiga) continua no claro.
export const currentTheme = () => (read(themeKey, read("lumina.theme", "escuro")) === "claro" ? "claro" : "escuro");

export function applyAppearance(theme = currentTheme()) {
  const root = document.documentElement;
  if (theme === "claro") root.dataset.theme = "light";
  else root.removeAttribute("data-theme");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "claro" ? "#f0eaf7" : "#0f0b14");
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    // Sem armazenamento, a escolha vale até fechar a aba.
  }
}
