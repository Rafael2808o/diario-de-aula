// Animações decorativas (estrelas, partículas, brilhos) são preferência do aparelho, como o tema.
// "reduzido" desliga o que é só enfeite e mantém as transições curtas que explicam o que mudou.
// A preferência de movimento reduzido do sistema vale sempre, mesmo com "completo" (ver atualizacao.css).
const motionKey = "grimiau.motion";

export const motionModes = [
  ["completo", "Com brilhos"],
  ["reduzido", "Discretas"],
];

export function currentMotion() {
  try {
    return localStorage.getItem(motionKey) === "reduzido" ? "reduzido" : "completo";
  } catch {
    return "completo";
  }
}

export function applyMotion(mode = currentMotion()) {
  document.documentElement.dataset.motion = mode;
  try {
    localStorage.setItem(motionKey, mode);
  } catch {
    // Sem armazenamento, a escolha vale até fechar a aba.
  }
}
