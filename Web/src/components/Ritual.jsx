import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Hourglass, Minus, Music, Pause, Play, Square, X } from "lucide-react";
import { useApp } from "../context.js";
import { todayIso } from "../lib/dates.js";
import { focusPhrases, phraseBag, restPhrases } from "../lib/phrases.js";
import { elapsedMs, formatClock, formatDuration } from "../lib/ritual.js";
import { Confirm, FormError, Nox } from "../ui.jsx";

const legacyPlaylistKey = "estuda.spotify.playlist";
const spotifyPattern = /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(playlist|album|episode|show|track)\/([A-Za-z0-9]{8,40})/;
export const canonicalSpotify = (value) => {
  const match = String(value || "").match(spotifyPattern);
  return match ? `https://open.spotify.com/${match[1]}/${match[2]}` : "";
};
const embedSpotify = (url) => url.replace("open.spotify.com/", "open.spotify.com/embed/") + "?utm_source=generator&theme=0";

// Relógio que só redesenha quando há uma sessão rodando; o valor sempre vem dos carimbos de tempo.
function useNow(active) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function useStudyPlaylist() {
  const { user, call, setUser } = useApp();
  const saved = user.preferences?.spotifyUrl || "";
  // A playlist da versão anterior ficava só no navegador; ela é levada para a conta uma única vez.
  useEffect(() => {
    if (saved) return;
    let legacy = "";
    try {
      legacy = canonicalSpotify(localStorage.getItem(legacyPlaylistKey));
    } catch {
      legacy = "";
    }
    if (!legacy) return;
    call("/me", { method: "PATCH", body: { preferences: { spotifyUrl: legacy } } })
      .then((updated) => {
        setUser(updated);
        try {
          localStorage.removeItem(legacyPlaylistKey);
        } catch {
          // Sem armazenamento, não há o que limpar.
        }
      })
      .catch(() => {});
  }, [saved, call, setUser]);
  const save = async (url) => setUser(await call("/me", { method: "PATCH", body: { preferences: { spotifyUrl: url } } }));
  return { url: saved, save };
}

function Playlist() {
  const { url, save } = useStudyPlaylist();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    const next = canonicalSpotify(new FormData(event.currentTarget).get("spotify"));
    if (!next) return setError("Cole o link de uma playlist, álbum, faixa ou podcast do Spotify.");
    setBusy(true);
    setError("");
    try {
      await save(next);
      setEditing(false);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await save("");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form className="ritual-music-form" onSubmit={submit}>
        <label>
          Link do Spotify
          <input name="spotify" defaultValue={url} placeholder="https://open.spotify.com/playlist/…" autoFocus inputMode="url" />
        </label>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>
            Cancelar
          </button>
          <button className="btn small primary" disabled={busy}>
            {busy ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    );
  }
  if (!url) {
    return (
      <button type="button" className="btn soft block" onClick={() => setEditing(true)}>
        <Music size={15} /> Adicionar minha playlist de estudos
      </button>
    );
  }
  return (
    <div className="ritual-music">
      <iframe title="Player do Spotify" src={embedSpotify(url)} height="152" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" />
      <div className="ritual-music-actions">
        <a className="btn small" href={url} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Abrir no Spotify
        </a>
        <button type="button" className="btn small ghost" onClick={() => setEditing(true)}>
          Trocar
        </button>
        <button type="button" className="btn small ghost" disabled={busy} onClick={remove}>
          Remover
        </button>
      </div>
      <FormError>{error}</FormError>
    </div>
  );
}

// Frase da vez: troca a cada 45 s com a sessão rodando, e muda de tom na pausa. Não toca no cronômetro.
function usePhrase(status) {
  const focus = useRef(phraseBag(focusPhrases));
  const rest = useRef(phraseBag(restPhrases));
  const [phrase, setPhrase] = useState(() => focus.current());
  useEffect(() => {
    setPhrase(status === "paused" ? rest.current() : focus.current());
    if (status !== "running" && status !== "paused") return undefined;
    const timer = setInterval(() => setPhrase(status === "paused" ? rest.current() : focus.current()), 45_000);
    return () => clearInterval(timer);
  }, [status]);
  return [phrase, () => setPhrase(status === "paused" ? rest.current() : focus.current())];
}

export function RitualButton() {
  const { ritual } = useApp();
  const active = ritual.state.status === "running" || ritual.state.status === "paused";
  const now = useNow(ritual.state.status === "running");
  return (
    <button
      type="button"
      className={`ritual-launch ${active ? "is-active" : ""}`}
      onClick={() => ritual.setView(ritual.view === "open" ? "closed" : "open")}
      aria-label={active ? `Ritual de Concentração, ${formatClock(elapsedMs(ritual.state, now))}` : "Abrir Ritual de Concentração"}
      aria-expanded={ritual.view === "open"}
    >
      <Hourglass size={17} aria-hidden="true" />
      {active ? <span className="ritual-launch-time">{formatClock(elapsedMs(ritual.state, now))}</span> : <span className="ritual-launch-label">Ritual</span>}
      {ritual.state.status === "paused" && <span className="sr-only">pausado</span>}
    </button>
  );
}

export default function Ritual() {
  const app = useApp();
  const { ritual, data, create, load, toast } = app;
  const { state, view, setView } = ritual;
  const [mounted, setMounted] = useState(view === "open");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [discarding, setDiscarding] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const now = useNow(state.status === "running");
  const [phrase, nextPhrase] = usePhrase(state.status);
  const elapsed = elapsedMs(state, now);
  const today = todayIso();
  const todaySeconds = useMemo(() => data["study-sessions"].filter((session) => session.date === today).reduce((sum, session) => sum + session.durationSeconds, 0), [data, today]);

  useEffect(() => {
    if (view === "open") setMounted(true);
  }, [view]);
  useEffect(() => {
    if (!celebrate) return undefined;
    const timer = setTimeout(() => setCelebrate(false), 2600);
    return () => clearTimeout(timer);
  }, [celebrate]);

  const save = async () => {
    setSaving(true);
    setError("");
    const seconds = Math.max(1, Math.round(state.accumulatedMs / 1000));
    try {
      await create("study-sessions", { clientId: state.id, date: state.date, startTime: state.startTime, durationSeconds: seconds, subjectId: state.subjectId || null });
      toast("Feitiço lançado com sucesso. Sessão guardada no histórico!");
      ritual.reset();
      setCelebrate(true);
    } catch (failure) {
      // Conflito quer dizer que esta sessão já foi gravada (outro clique ou outra aba): só sincroniza.
      if (failure.status === 409) {
        ritual.reset();
        await load();
        toast("Esta sessão já estava no histórico.");
      } else setError(failure.message);
    } finally {
      setSaving(false);
    }
  };

  const mood = celebrate ? "happy" : state.status === "paused" ? "sleepy" : state.status === "running" ? "focused" : state.status === "finished" ? "happy" : "calm";
  const statusText = { idle: "Pronto para começar", running: "Concentração em andamento", paused: "Pausado: o tempo parado não conta", finished: "Sessão finalizada" }[state.status];
  const subject = data.subjects.find((item) => item.id === state.subjectId);

  return (
    <>
      {mounted && (
        <section className={`ritual-panel ${celebrate ? "is-celebrating" : ""}`} hidden={view !== "open"} aria-labelledby="ritual-title">
          <header className="ritual-head">
            <Nox size={46} mood={mood} alive={state.status === "running"} />
            <div>
              <h2 id="ritual-title">Ritual de Concentração</h2>
              <p>{statusText}</p>
            </div>
            <button type="button" className="icon-btn" aria-label="Minimizar painel (a sessão continua)" title="Minimizar" onClick={() => setView("minimized")}>
              <Minus size={17} />
            </button>
            <button type="button" className="icon-btn" aria-label="Fechar painel (a sessão continua)" title="Fechar" onClick={() => setView("closed")}>
              <X size={17} />
            </button>
          </header>

          <p className="ritual-clock" role="timer" aria-label={`Tempo de estudo: ${formatClock(elapsed)}`}>
            {formatClock(elapsed)}
          </p>
          <p className="ritual-phrase" key={phrase} aria-live="polite">
            <button type="button" onClick={nextPhrase} title="Outra frase">
              {phrase}
            </button>
          </p>

          {state.status !== "finished" && data.subjects.length > 0 && (
            <label className="ritual-subject">
              Disciplina
              <select value={state.subjectId || ""} onChange={(event) => ritual.setSubject(event.target.value)} disabled={state.status === "idle"}>
                <option value="">Sem disciplina</option>
                {data.subjects.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="ritual-controls">
            {state.status === "idle" && (
              <button type="button" className="btn primary block" onClick={() => ritual.start()}>
                <Play size={16} /> Iniciar ritual
              </button>
            )}
            {state.status === "running" && (
              <>
                <button type="button" className="btn" onClick={ritual.pause}>
                  <Pause size={16} /> Pausar
                </button>
                <button type="button" className="btn primary" onClick={ritual.finish}>
                  <Square size={14} /> Finalizar
                </button>
              </>
            )}
            {state.status === "paused" && (
              <>
                <button type="button" className="btn primary" onClick={ritual.resume}>
                  <Play size={16} /> Retomar
                </button>
                <button type="button" className="btn" onClick={ritual.finish}>
                  <Square size={14} /> Finalizar
                </button>
              </>
            )}
          </div>

          {state.status === "finished" && (
            <div className="ritual-summary">
              <p>
                Você estudou <strong>{formatDuration(state.accumulatedMs / 1000)}</strong>
                {subject ? ` de ${subject.name}` : ""}. Quer guardar no histórico?
              </p>
              {data.subjects.length > 0 && (
                <label className="ritual-subject">
                  Disciplina
                  <select value={state.subjectId || ""} onChange={(event) => ritual.setSubject(event.target.value)}>
                    <option value="">Sem disciplina</option>
                    {data.subjects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <FormError>{error}</FormError>
              <div className="ritual-controls">
                <button type="button" className="btn ghost" disabled={saving} onClick={() => setDiscarding(true)}>
                  Descartar
                </button>
                <button type="button" className="btn primary" disabled={saving} onClick={save}>
                  {saving ? "Salvando..." : "Salvar no histórico"}
                </button>
              </div>
            </div>
          )}

          <p className="ritual-today">Hoje você já estudou {formatDuration(todaySeconds)} em sessões salvas.</p>

          <div className="ritual-section">
            <h3>Trilha sonora</h3>
            <Playlist />
          </div>
          {celebrate && <span className="ritual-stars" aria-hidden="true" />}
        </section>
      )}

      {view === "minimized" && (
        <button type="button" className={`ritual-pill status-${state.status}`} onClick={() => setView("open")} aria-label="Abrir o Ritual de Concentração">
          <Nox size={30} mood={mood} />
          <span>{state.status === "idle" ? "Ritual" : formatClock(elapsed)}</span>
          {state.status === "paused" && <small>pausado</small>}
        </button>
      )}

      {discarding && (
        <Confirm
          title="Descartar esta sessão?"
          message="O tempo desta sessão não vai para o histórico. As sessões já salvas continuam lá."
          confirmLabel="Descartar"
          onConfirm={async () => ritual.reset()}
          onClose={() => setDiscarding(false)}
        />
      )}
    </>
  );
}
