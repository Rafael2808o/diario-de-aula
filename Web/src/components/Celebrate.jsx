import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Award } from "lucide-react";

// Comemorações que não interrompem: partículas e um cartão que some sozinho, sem bloquear clique nem foco.
// Só são chamadas depois que a API confirmou o registro (XP) ou o servidor registrou a relíquia (aviso).
const particles = Array.from({ length: 22 }, (_, index) => {
  const angle = (index / 22) * Math.PI * 2;
  const distance = 70 + (index % 4) * 22;
  return { x: `${Math.round(Math.cos(angle) * distance)}px`, y: `${Math.round(Math.sin(angle) * distance)}px`, delay: `${(index % 5) * 40}ms`, gold: index % 3 !== 0 };
});

export function useCelebrations() {
  const [relic, setRelic] = useState(null);
  const [xp, setXp] = useState(null);
  const relicTimer = useRef(null);
  const xpTimer = useRef(null);
  const celebrateRelic = useCallback((item) => {
    clearTimeout(relicTimer.current);
    setRelic({ ...item, key: Date.now() });
    relicTimer.current = setTimeout(() => setRelic(null), 5200);
  }, []);
  const celebrateXp = useCallback((amount) => {
    if (amount <= 0) return;
    clearTimeout(xpTimer.current);
    setXp({ amount, key: Date.now() });
    xpTimer.current = setTimeout(() => setXp(null), 2600);
  }, []);
  useEffect(() => () => {
    clearTimeout(relicTimer.current);
    clearTimeout(xpTimer.current);
  }, []);
  return useMemo(() => ({ relic, xp, celebrateRelic, celebrateXp }), [relic, xp, celebrateRelic, celebrateXp]);
}

export default function Celebrations({ state }) {
  return (
    <div className="celebrations" aria-live="polite">
      {state.xp && (
        <span key={state.xp.key} className="xp-gain">
          +{state.xp.amount} XP
        </span>
      )}
      {state.relic && (
        <div key={state.relic.key} className="relic-burst" role="status">
          <div className="burst" aria-hidden="true">
            {particles.map((particle, index) => (
              <i key={index} className={particle.gold ? "is-gold" : ""} style={{ "--x": particle.x, "--y": particle.y, animationDelay: particle.delay }} />
            ))}
          </div>
          <span className="relic-burst-icon" aria-hidden="true">
            <Award size={22} />
          </span>
          <span>
            <small>Relíquia conquistada</small>
            <strong>{state.relic.title.replace(/^Nova relíquia: /, "")}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
