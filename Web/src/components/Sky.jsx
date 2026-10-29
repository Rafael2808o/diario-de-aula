import { memo, useEffect, useRef } from "react";

// Céu do fundo: estrelas que piscam devagar, poeira luminosa subindo e, de vez em quando, uma estrela cadente.
// Fica atrás de tudo, não recebe clique nem foco e para quando a aba está escondida.
// Posições fixas (sorteio com semente) para o céu não "pular" a cada visita.
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

const random = seeded(20261029);
const stars = Array.from({ length: 42 }, (_, index) => ({
  left: `${(random() * 100).toFixed(2)}%`,
  top: `${(random() * 100).toFixed(2)}%`,
  size: random() < 0.18 ? 3 : random() < 0.5 ? 2 : 1.5,
  delay: `${(random() * 7).toFixed(2)}s`,
  duration: `${(4 + random() * 5).toFixed(2)}s`,
  gold: index % 7 === 0,
}));
const motes = Array.from({ length: 9 }, () => ({
  left: `${(random() * 100).toFixed(2)}%`,
  delay: `${(random() * 22).toFixed(2)}s`,
  duration: `${(22 + random() * 16).toFixed(2)}s`,
  drift: `${Math.round(random() * 60 - 30)}px`,
}));

function Sky() {
  const layer = useRef(null);
  useEffect(() => {
    const sync = () => layer.current?.classList.toggle("is-paused", document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  return (
    <div className="sky" ref={layer} aria-hidden="true">
      {stars.map((star, index) => (
        <i
          key={`s${index}`}
          className={`sky-star ${star.gold ? "is-gold" : ""}`}
          style={{ left: star.left, top: star.top, width: star.size, height: star.size, animationDelay: star.delay, animationDuration: star.duration }}
        />
      ))}
      {motes.map((mote, index) => (
        <i key={`m${index}`} className="sky-mote" style={{ left: mote.left, animationDelay: mote.delay, animationDuration: mote.duration, "--drift": mote.drift }} />
      ))}
      <i className="sky-comet" />
      <svg className="sky-constellation" viewBox="0 0 160 90" width="160" height="90">
        <polyline points="8,70 40,52 66,60 98,30 132,38 152,14" />
        {[[8, 70], [40, 52], [66, 60], [98, 30], [132, 38], [152, 14]].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" />
        ))}
      </svg>
    </div>
  );
}

export default memo(Sky);
