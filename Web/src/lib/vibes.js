// Vibe do momento (versão 4.2). Os ids são os da API (showcase.js: vibes); os nomes valem para qualquer pessoa.
// Vale por 24 horas e aparece no perfil e em "Bruxinhos por aqui".
export const vibes = [
  { id: "focada", label: "No foco", color: "#b79cf0" },
  { id: "tranquila", label: "De boa", color: "#7fe0c0" },
  { id: "animada", label: "Animação total", color: "#f5b8ff" },
  { id: "inspirada", label: "Inspiração em alta", color: "#f6c85f" },
  { id: "cansada", label: "Cansaço", color: "#8fa6ff" },
  { id: "estressada", label: "Semana de prova", color: "#ff9a8a" },
];
export const vibeOf = (id) => vibes.find((vibe) => vibe.id === id);
