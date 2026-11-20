// Desenhos das figurinhas (referência "Caderno de Aula", 18/11/2026). Todas em viewBox 0 0 64 64.
// Os ids são os mesmos dos recados guardados na API (não renomear).
export const figurinhaArt = {
  lua: '<path d="M30 6.1A26 26 0 1 0 53.3 46.8A24 24 0 0 1 30 6.1Z" fill="#f6c85f"/><path d="M46 20L48 25L53 27L48 29L46 34L44 29L39 27L44 25Z" fill="#fff1c4"/>',
  estrela: '<polygon points="32,6 38.5,23.1 56.7,24 42.5,35.4 47.3,53 32,43 16.7,53 21.5,35.4 7.3,24 25.5,23.1" fill="#f6c85f" stroke="#e0a82e" stroke-width="2" stroke-linejoin="round"/>',
  constelacao: '<circle cx="32" cy="32" r="29" fill="#2a1f55"/><path d="M14 44L24 22L40 34L52 16M40 34L50 48" fill="none" stroke="#b9a6ff" stroke-width="1.6"/><g fill="#f6c85f"><circle cx="14" cy="44" r="3"/><circle cx="24" cy="22" r="3.4"/><circle cx="40" cy="34" r="3"/><circle cx="52" cy="16" r="3.4"/><circle cx="50" cy="48" r="2.6"/></g><g fill="#fff"><circle cx="30" cy="52" r="1"/><circle cx="10" cy="26" r="1"/><circle cx="44" cy="54" r="1"/></g>',
  gato: '<path d="M12 28L10 6L28 16Z" fill="#2b2150"/><path d="M52 28L54 6L36 16Z" fill="#2b2150"/><path d="M14 22L13 11L23 16Z" fill="#7a5bd0"/><path d="M50 22L51 11L41 16Z" fill="#7a5bd0"/><ellipse cx="32" cy="36" rx="23" ry="21" fill="#2b2150"/><circle cx="32" cy="25" r="4.2" fill="#f6c85f"/><circle cx="33.8" cy="24" r="3.4" fill="#2b2150"/><path d="M20 39q4-4 8 0M36 39q4-4 8 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M30 45h4l-2 2.4z" fill="#f08fb0"/><path d="M26 49q3 3 6 0q3 3 6 0" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/>',
  livro: '<path d="M5 16C14 13 24 14 31 19V56C24 52 14 51 5 54Z" fill="#efe7ff" stroke="#6b4fbf" stroke-width="2.5" stroke-linejoin="round"/><path d="M59 16C50 13 40 14 33 19V56C40 52 50 51 59 54Z" fill="#efe7ff" stroke="#6b4fbf" stroke-width="2.5" stroke-linejoin="round"/><path d="M11 25c5-1 10 0 14 2M11 33c5-1 10 0 14 2M39 27c4-2 9-3 14-2M39 35c4-2 9-3 14-2" stroke="#a48be0" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M32 4L33.6 8L38 8.6L34.6 11.4L35.6 16L32 13.6L28.4 16L29.4 11.4L26 8.6L30.4 8Z" fill="#f6c85f"/>',
  pocao: '<rect x="25" y="4" width="14" height="8" rx="2" fill="#b07a4a"/><path d="M27 12h10v14L52 50c3 6-1 10-7 10H19c-6 0-10-4-7-10L27 26Z" fill="#e4dcff"/><path d="M17 42H47L52 50C55 56 51 60 45 60H19C13 60 9 56 12 50Z" fill="#58d3ae"/><path d="M27 12h10v14L52 50c3 6-1 10-7 10H19c-6 0-10-4-7-10L27 26Z" fill="none" stroke="#6b4fbf" stroke-width="2.5" stroke-linejoin="round"/><circle cx="28" cy="50" r="2.4" fill="#fff"/><circle cx="38" cy="54" r="1.8" fill="#fff"/>',
  vela: '<rect x="22" y="28" width="20" height="28" rx="3" fill="#f3ecff" stroke="#6b4fbf" stroke-width="2.5"/><path d="M32 5C41 16 40 24 32 27C24 24 23 16 32 5Z" fill="#ffb347"/><path d="M32 14C36 19 35 23 32 24C29 23 28 19 32 14Z" fill="#fff0b8"/><rect x="16" y="56" width="32" height="4" rx="2" fill="#6b4fbf"/><path d="M27 36q3 4 3 9" stroke="#d3c3f7" stroke-width="2" fill="none" stroke-linecap="round"/>',
  olho: '<path d="M3 34Q32 8 61 34Q32 60 3 34Z" fill="#efe7ff" stroke="#6b4fbf" stroke-width="2.5" stroke-linejoin="round"/><circle cx="32" cy="34" r="11" fill="#8a6bd6"/><circle cx="32" cy="34" r="5" fill="#1b1433"/><circle cx="35.5" cy="30.5" r="2" fill="#fff"/><path d="M32 14V7M16 22l-3-5M48 22l3-5" stroke="#6b4fbf" stroke-width="2.5" stroke-linecap="round"/>',
  cristal: '<polygon points="32,5 52,22 44,56 20,56 12,22" fill="#7ad7ec" stroke="#2f8fa8" stroke-width="2.5" stroke-linejoin="round"/><polygon points="32,5 24,22 40,22" fill="#b9f0fb"/><path d="M12 22H52M24 22L32 56L40 22" stroke="#e9fbff" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  coracao: '<path d="M32 56C10 42 6 28 10 19C14 10 26 10 32 20C38 10 50 10 54 19C58 28 54 42 32 56Z" fill="#ff7a9c" stroke="#c43c63" stroke-width="2.5" stroke-linejoin="round"/><path d="M17 22c2-4 6-5 9-3" stroke="#ffd3df" stroke-width="3" stroke-linecap="round" fill="none"/>',
};

// Figurinhas soltas da página (mesma lista da API em notebook.js: pageStickers).
const stampArt = (text, bg, fg, length) =>
  `<rect x="2" y="2" width="136" height="40" rx="12" fill="${bg}"/><rect x="7" y="7" width="126" height="30" rx="8" fill="none" stroke="${fg}" stroke-opacity=".45" stroke-dasharray="3 3"/><text x="70" y="27.5" text-anchor="middle" font-family="Lexend,system-ui,sans-serif" font-weight="800" font-size="15" fill="${fg}" textLength="${length}" lengthAdjust="spacingAndGlyphs">${text}</text>`;
const round = (fill, path) => `<circle cx="32" cy="32" r="28" fill="${fill}"/>${path}`;
export const pageStickerArt = {
  lua: { group: "Místicas", label: "Lua", size: 76, body: figurinhaArt.lua },
  estrela: { group: "Místicas", label: "Estrela", size: 70, body: figurinhaArt.estrela },
  constelacao: { group: "Místicas", label: "Constelação", size: 80, body: figurinhaArt.constelacao },
  gato: { group: "Místicas", label: "Gato do Grimiau", size: 84, body: figurinhaArt.gato },
  livro: { group: "Místicas", label: "Livro mágico", size: 80, body: figurinhaArt.livro },
  pocao: { group: "Místicas", label: "Poção", size: 76, body: figurinhaArt.pocao },
  vela: { group: "Místicas", label: "Vela", size: 72, body: figurinhaArt.vela },
  olho: { group: "Místicas", label: "Olho místico", size: 80, body: figurinhaArt.olho },
  cristal: { group: "Místicas", label: "Cristal", size: 70, body: figurinhaArt.cristal },
  importante: { group: "Carimbos", label: "Importante", size: 132, wide: true, body: stampArt("IMPORTANTE", "#ff7a9c", "#3a0a1c", 100) },
  cai: { group: "Carimbos", label: "Cai na prova", size: 132, wide: true, body: stampArt("CAI NA PROVA", "#f6c85f", "#3a2a00", 108) },
  revisar: { group: "Carimbos", label: "Revisar", size: 120, wide: true, body: stampArt("REVISAR", "#a891f0", "#1c0f45", 70) },
  duvida: { group: "Carimbos", label: "Dúvida", size: 120, wide: true, body: stampArt("DÚVIDA", "#6fd0e0", "#06303a", 66) },
  dominei: { group: "Carimbos", label: "Dominei", size: 120, wide: true, body: stampArt("DOMINEI", "#5fd3a5", "#05341f", 72) },
  exemplo: { group: "Carimbos", label: "Exemplo", size: 120, wide: true, body: stampArt("EXEMPLO", "#ffa36b", "#3d1700", 74) },
  definicao: { group: "Carimbos", label: "Definição", size: 128, wide: true, body: stampArt("DEFINIÇÃO", "#e9e1ff", "#2b1a63", 92) },
  check: { group: "Marcadores", label: "Check", size: 56, body: round("#5fd3a5", '<path d="M19 33l9 9 18-20" stroke="#05341f" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>') },
  exclamacao: { group: "Marcadores", label: "Exclamação", size: 56, body: round("#ff7a9c", '<path d="M32 16v20" stroke="#3a0a1c" stroke-width="7" stroke-linecap="round"/><circle cx="32" cy="47" r="4" fill="#3a0a1c"/>') },
  interrogacao: { group: "Marcadores", label: "Interrogação", size: 56, body: round("#6fd0e0", '<path d="M23 26c0-6 4-9 9-9s9 3 9 8c0 6-8 7-9 13" stroke="#06303a" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="32" cy="49" r="4" fill="#06303a"/>') },
  ampulheta: { group: "Marcadores", label: "Ampulheta", size: 56, body: '<path d="M16 6H48M16 58H48" stroke="#6b4fbf" stroke-width="5" stroke-linecap="round"/><path d="M20 10H44C44 24 36 28 32 32C36 36 44 40 44 54H20C20 40 28 36 32 32C28 28 20 24 20 10Z" fill="#efe7ff" stroke="#6b4fbf" stroke-width="2.5" stroke-linejoin="round"/><path d="M25 14H39C38 22 34 25 32 27C30 25 26 22 25 14Z" fill="#f6c85f"/><path d="M26 54C27 46 30 42 32 40C34 42 37 46 38 54Z" fill="#f6c85f"/>' },
  coracao: { group: "Marcadores", label: "Coração", size: 56, body: figurinhaArt.coracao },
  seta: { group: "Marcadores", label: "Seta", size: 56, body: round("#a891f0", '<path d="M16 32H46M35 20L47 32L35 44" stroke="#1c0f45" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>') },
};
export const stickerGroups = ["Místicas", "Carimbos", "Marcadores"];

// Carimbos que entram no texto do Caderno (<span data-stamp="...">). A ordem é a da barra de ferramentas.
export const carimbos = [
  ["cai", "Cai na prova"],
  ["importante", "Importante"],
  ["revisar", "Revisar"],
  ["duvida", "Dúvida"],
  ["dominei", "Dominei"],
  ["exemplo", "Exemplo"],
  ["definicao", "Definição"],
];
