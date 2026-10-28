import { useEffect, useState } from "react";
import { useApp } from "../context.js";
import { formatFull, todayIso } from "../lib/dates.js";

export const zodiac = [
  ["aries", "Áries", "♈"],
  ["touro", "Touro", "♉"],
  ["gemeos", "Gêmeos", "♊"],
  ["cancer", "Câncer", "♋"],
  ["leao", "Leão", "♌"],
  ["virgem", "Virgem", "♍"],
  ["libra", "Libra", "♎"],
  ["escorpiao", "Escorpião", "♏"],
  ["sagitario", "Sagitário", "♐"],
  ["capricornio", "Capricórnio", "♑"],
  ["aquario", "Aquário", "♒"],
  ["peixes", "Peixes", "♓"],
];

// Card do horóscopo. O signo fica na conta; a previsão vem da API, que só devolve a do dia de hoje (São Paulo).
export function useSaveSign() {
  const { call, setUser } = useApp();
  return async (sign) => setUser(await call("/me", { method: "PATCH", body: { preferences: { sign } } }));
}

export default function Horoscope() {
  const { user, call } = useApp();
  const saveSign = useSaveSign();
  const sign = user.preferences?.sign || "";
  const [state, setState] = useState({ status: sign ? "loading" : "idle" });
  const [choosing, setChoosing] = useState(false);
  const [error, setError] = useState("");
  const today = todayIso();

  useEffect(() => {
    if (!sign) return undefined;
    let alive = true;
    setState({ status: "loading" });
    call(`/horoscope/${sign}`)
      .then((payload) => alive && setState(payload.date === today ? { status: "ready", ...payload } : { status: "unavailable" }))
      .catch(() => alive && setState({ status: "unavailable" }));
    return () => {
      alive = false;
    };
  }, [sign, call, today]);

  const pick = async (value) => {
    setError("");
    try {
      await saveSign(value);
      setChoosing(false);
    } catch (failure) {
      setError(failure.message);
    }
  };

  const current = zodiac.find(([id]) => id === sign);

  if (!sign || choosing) {
    return (
      <section className="horoscope" aria-labelledby="horoscope-title">
        <h2 id="horoscope-title" className="horoscope-title">
          Qual constelação guia seu dia?
        </h2>
        <div className="zodiac-grid">
          {zodiac.map(([id, name, symbol]) => (
            <button key={id} type="button" className={id === sign ? "active" : ""} aria-pressed={id === sign} onClick={() => pick(id)}>
              <span aria-hidden="true">{symbol}</span>
              {name}
            </button>
          ))}
        </div>
        {error && <p className="form-error">{error}</p>}
        {choosing && (
          <button type="button" className="link-btn" onClick={() => setChoosing(false)}>
            Cancelar
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="horoscope" aria-labelledby="horoscope-title" aria-busy={state.status === "loading"}>
      <header className="horoscope-head">
        <span className="zodiac-symbol" aria-hidden="true">
          {current[2]}
        </span>
        <div>
          <h2 id="horoscope-title" className="horoscope-title">
            {current[1]}
          </h2>
          <small>Horóscopo de {formatFull(today)}</small>
        </div>
        <button type="button" className="link-btn" onClick={() => setChoosing(true)}>
          Trocar signo
        </button>
      </header>
      {state.status === "loading" && <p className="quiet">Consultando as estrelas...</p>}
      {state.status === "ready" && (
        <>
          <p className="horoscope-text">{state.text}</p>
          <small className="horoscope-source">Fonte: {state.source}. Tradução e resumo automáticos.</small>
        </>
      )}
      {state.status === "unavailable" && <p className="quiet">As estrelas estão nubladas: a previsão de hoje ainda não chegou. Tente mais tarde.</p>}
    </section>
  );
}
