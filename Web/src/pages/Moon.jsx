import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Music2, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { addMonths, endOfMonth, formatFull, formatLong, formatMonth, range, startOfMonth, startOfWeek, addDays, weekdays } from "../lib/dates.js";
import { moodById, moods, periodSummary, shiftDay, songCategories, weekMessage, weekStartOf } from "../lib/moods.js";
import { Avatar, Confirm, Empty, FormError, Modal, Segmented, useSubmit } from "../ui.jsx";

// Lua desenhada pela fase (0 = nova, 0,5 = cheia). O lado claro cresce pela direita e míngua pela esquerda.
export function MoonPhase({ phase, size = 56, className = "" }) {
  const r = 20;
  const c = 24;
  const rx = Math.abs(Math.cos(phase * 2 * Math.PI)) * r;
  const waxing = phase < 0.5;
  const crescent = phase < 0.25 || phase > 0.75;
  let lit = "";
  if (phase > 0) {
    lit = waxing
      ? `M${c},${c - r} A${r},${r} 0 0 1 ${c},${c + r} A${rx},${r} 0 0 ${crescent ? 0 : 1} ${c},${c - r}Z`
      : `M${c},${c - r} A${r},${r} 0 0 0 ${c},${c + r} A${rx},${r} 0 0 ${crescent ? 1 : 0} ${c},${c - r}Z`;
  }
  return (
    <svg className={`moon-phase ${className}`} viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <circle className="moon-dark" cx={c} cy={c} r={r} />
      {lit && <path className="moon-lit" d={lit} />}
      <circle className="moon-rim" cx={c} cy={c} r={r} />
    </svg>
  );
}

function MoodPicker({ today, current, onSaved }) {
  const { call, reloadLunar, toast } = useApp();
  const [chosen, setChosen] = useState(current?.mood || "");
  const { submit, busy, error } = useSubmit(async () => {
    const saved = await call("/lunar/moods/today", { method: "PUT", body: { mood: chosen } });
    await reloadLunar();
    return saved;
  }, {
    onDone: (saved) => {
      toast(saved.created ? "Mood registrado. Bom estudo, estrelinha." : "Mood de hoje atualizado.");
      onSaved?.();
    },
  });
  const selected = moodById[chosen];
  const unchanged = current && current.mood === chosen;
  return (
    <section className="moon-picker" aria-labelledby="lua-pergunta">
      <div className="moon-hero">
        <h1 id="lua-pergunta">Como está sua energia acadêmica hoje?</h1>
        <p>Escolha seu mood, registre seu dia e descubra quem está na mesma fase que você.</p>
        {current && (
          <p className="moon-today">
            Hoje ({formatFull(today)}) você registrou: <strong>{moodById[current.mood]?.name}</strong>. Pode trocar até o fim do dia.
          </p>
        )}
      </div>
      <div className="mood-grid" role="radiogroup" aria-label="Moods">
        {moods.map((mood) => (
          <button
            key={mood.id}
            type="button"
            role="radio"
            aria-checked={chosen === mood.id}
            className={`mood-card ${chosen === mood.id ? "is-chosen" : ""} ${current?.mood === mood.id ? "is-today" : ""}`}
            onClick={() => setChosen(mood.id)}
          >
            <MoonPhase phase={mood.phase} size={52} />
            <strong>{mood.name}</strong>
            <em>“{mood.quote}”</em>
            <small>{mood.text}</small>
          </button>
        ))}
      </div>
      {selected && (
        <div className="mood-confirm" aria-live="polite">
          <MoonPhase phase={selected.phase} size={72} className="is-glowing" />
          <div>
            <strong>{selected.name}</strong>
            <p>“{selected.quote}”</p>
            <FormError>{error}</FormError>
          </div>
          <button type="button" className="btn primary" disabled={busy || unchanged} onClick={() => submit()}>
            {busy ? "Registrando..." : unchanged ? "Já registrado hoje" : current ? "Trocar meu mood de hoje" : "Registrar meu mood"}
          </button>
        </div>
      )}
      <p className="footnote">Os moods são brincadeiras para acompanhar sua fase, não diagnósticos nem notas de desempenho.</p>
    </section>
  );
}

function LunarHistory({ records, today }) {
  const [cursor, setCursor] = useState(today);
  const [picked, setPicked] = useState(today);
  const byDate = useMemo(() => Object.fromEntries(records.map((record) => [record.date, record.mood])), [records]);
  const monthFrom = startOfMonth(cursor);
  const monthTo = endOfMonth(cursor);
  const gridFrom = startOfWeek(monthFrom);
  const gridTo = addDays(startOfWeek(monthTo), 6);
  const week = weekStartOf(today);
  const weekSummary = periodSummary(records, week, shiftDay(week, 6), today);
  const monthSummary = periodSummary(records, monthFrom, monthTo, today);
  const pickedMood = moodById[byDate[picked]];
  return (
    <section className="moon-section" aria-labelledby="historico-lunar">
      <h2 className="section-title" id="historico-lunar">Meu histórico lunar</h2>
      <div className="moon-history">
        <div className="group moon-calendar">
          <div className="calendar-nav">
            <button className="icon-btn" aria-label="Mês anterior" onClick={() => setCursor(addMonths(cursor, -1))}>
              <ChevronLeft size={18} />
            </button>
            <h3>{formatMonth(cursor)}</h3>
            <button className="icon-btn" aria-label="Próximo mês" disabled={monthTo >= today && monthFrom <= today} onClick={() => setCursor(addMonths(cursor, 1))}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="moon-month">
            {weekdays.map((day) => (
              <span key={day} className="month-head">{day.slice(0, 1)}</span>
            ))}
            {range(gridFrom, gridTo).map((day) => {
              const mood = moodById[byDate[day]];
              const future = day > today;
              return (
                <button
                  key={day}
                  type="button"
                  disabled={future}
                  className={`${day.slice(0, 7) !== cursor.slice(0, 7) ? "outside" : ""} ${day === today ? "today" : ""} ${day === picked ? "picked" : ""} ${!mood && !future ? "is-empty" : ""}`}
                  onClick={() => setPicked(day)}
                  aria-label={`${formatLong(day)}: ${mood ? mood.name : future ? "dia futuro" : "sem registro"}`}
                >
                  <span>{Number(day.slice(8))}</span>
                  {mood ? <MoonPhase phase={mood.phase} size={20} /> : <i className="moon-none" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <p className="moon-picked">
            <strong>{formatFull(picked)}:</strong> {pickedMood ? `${pickedMood.name}. “${pickedMood.quote}”` : picked === today ? "ainda sem mood hoje. Escolha lá em cima." : "sem registro neste dia."}
          </p>
        </div>
        <div className="moon-stats">
          <div className="group moon-stat">
            <h3>Esta semana</h3>
            <p>{weekMessage(weekSummary)}</p>
            <MoodBars summary={weekSummary} />
          </div>
          <div className="group moon-stat">
            <h3>{formatMonth(cursor)}</h3>
            {monthFrom > today ? (
              <p className="hint">Mês que ainda não começou.</p>
            ) : (
              <>
                <p className="hint">
                  {monthSummary.registered} {monthSummary.registered === 1 ? "dia registrado" : "dias registrados"} e {monthSummary.missing} sem registro.
                </p>
                <MoodBars summary={monthSummary} />
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function MoodBars({ summary }) {
  if (!summary.registered) return null;
  const max = summary.ranked[0][1];
  return (
    <ul className="mood-bars">
      {summary.ranked.map(([id, count]) => (
        <li key={id}>
          <MoonPhase phase={moodById[id].phase} size={18} />
          <span>{moodById[id].name.replace("Estudante ", "")}</span>
          <span className="mood-bar" aria-hidden="true">
            <i style={{ width: `${(count / max) * 100}%` }} />
          </span>
          <strong>{count}</strong>
        </li>
      ))}
    </ul>
  );
}

function Constellation({ today }) {
  const { call, user, setUser, toast } = useApp();
  const [week, setWeek] = useState(weekStartOf(today));
  const [tab, setTab] = useState("geral");
  const [state, setState] = useState({ status: "loading" });
  const [editing, setEditing] = useState(false);
  const prefs = user.preferences || {};
  const load = useCallback(async () => {
    setState((current) => ({ ...current, status: current.data ? "ready" : "loading" }));
    try {
      setState({ status: "ready", data: await call(`/lunar/constellation?semana=${week}`) });
    } catch {
      setState({ status: "error" });
    }
  }, [call, week]);
  useEffect(() => {
    load();
  }, [load]);
  const savePrefs = useSubmit(async (changes) => {
    setUser(await call("/me", { method: "PATCH", body: { preferences: changes } }));
    await load();
    return true;
  });
  const list = state.data ? (tab === "geral" ? state.data.general : state.data.byMood[tab]) : [];
  const thisWeek = weekStartOf(today);
  return (
    <section className="moon-section" aria-labelledby="constelacao">
      <div className="section-head">
        <h2 className="section-title" id="constelacao">Constelação da Semana</h2>
        <div className="week-nav">
          <button className="icon-btn" aria-label="Semana anterior" onClick={() => setWeek(shiftDay(week, -7))}>
            <ChevronLeft size={17} />
          </button>
          <span>
            {formatFull(week).replace(/ de \d{4}$/, "")} a {formatFull(shiftDay(week, 6)).replace(/ de \d{4}$/, "")}
          </span>
          <button className="icon-btn" aria-label="Próxima semana" disabled={week >= thisWeek} onClick={() => setWeek(shiftDay(week, 7))}>
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="group constellation-join">
        {prefs.lunarPublic ? (
          <p>
            Você aparece como <strong>{prefs.nickname || "seu nome público"}</strong>
            {prefs.lunarShowPhoto === false ? ", sem foto" : ", com sua foto de perfil"}.{" "}
            <button className="link-btn" onClick={() => setEditing(true)}>Mudar apelido ou foto</button> ·{" "}
            <button className="link-btn" disabled={savePrefs.busy} onClick={() => savePrefs.submit({ lunarPublic: false }).then((done) => done !== undefined && toast("Você saiu da Constelação."))}>
              Sair da Constelação
            </button>
          </p>
        ) : (
          <p>
            A Constelação é opcional: seus moods só aparecem aqui se você quiser.{" "}
            <button className="btn soft small" onClick={() => setEditing(true)}>Participar com um apelido</button>
          </p>
        )}
        <FormError>{savePrefs.error}</FormError>
      </div>
      <div className="mood-tabs" role="tablist" aria-label="Ranking por mood">
        {[["geral", "Geral"], ...moods.map((mood) => [mood.id, mood.name.replace("Estudante ", "").replace("em sua ", "")])].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
            {id !== "geral" && <MoonPhase phase={moodById[id].phase} size={16} />} {label}
          </button>
        ))}
      </div>
      {state.status === "loading" ? (
        <p className="quiet">Consultando as estrelas...</p>
      ) : state.status === "error" ? (
        <p className="quiet">A Constelação não abriu agora. Tente de novo em instantes.</p>
      ) : list.length ? (
        <ol className="group podium">
          {list.map((item) => (
            <li key={`${item.position}-${item.name}`} className={`row podium-row place-${item.position} ${item.me ? "is-me" : ""}`}>
              <span className="podium-star" aria-label={`${item.position}º lugar`}>
                {item.position}º
              </span>
              <Avatar user={{ id: item.userId, name: item.name, avatarVersion: item.avatarVersion }} size={36} />
              <span className="row-main">
                <strong>
                  {item.name}
                  {item.me && <span className="badge">você</span>}
                </strong>
                <small>{tab === "geral" ? "dias com mood registrado" : moodById[tab].name}</small>
              </span>
              <span className="row-end">
                <strong>
                  {item.days} {item.days === 1 ? "dia" : "dias"}
                </strong>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <Empty compact mood="sleepy" title="Ninguém nesta fase da semana ainda.">
          {state.data.participants ? "Quando alguém da Constelação registrar este mood, aparece aqui." : "Ninguém entrou na Constelação ainda."}
        </Empty>
      )}
      <p className="footnote">
        Conta dias diferentes com o mood na semana (segunda a domingo); trocar o mood no mesmo dia não soma ponto. Empate: fica na frente quem registrou primeiro na semana, depois a ordem
        alfabética. É só uma brincadeira de participação: não mede quem estudou mais.
      </p>
      {editing && (
        <Modal title="Participar da Constelação" onClose={() => setEditing(false)}>
          <form
            className="form"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const done = await savePrefs.submit({ lunarPublic: true, nickname: String(form.get("nickname") || ""), lunarShowPhoto: form.get("photo") === "on" });
              if (done !== undefined) {
                setEditing(false);
                toast("Pronto, você está na Constelação.");
              }
            }}
          >
            <label>
              Apelido (opcional)
              <input name="nickname" maxLength={30} defaultValue={prefs.nickname || ""} placeholder="Ex.: Bruxinha da Madrugada" />
              <small className="hint">Sem apelido, aparece seu nome público (primeiro nome e inicial). Vale também na Rádio das Estrelinhas.</small>
            </label>
            <label className="check">
              <input type="checkbox" name="photo" defaultChecked={prefs.lunarShowPhoto !== false} /> Mostrar minha foto de perfil
            </label>
            <FormError>{savePrefs.error}</FormError>
            <div className="form-actions">
              <span className="spacer" />
              <button type="button" className="btn ghost" onClick={() => setEditing(false)}>Cancelar</button>
              <button className="btn primary" disabled={savePrefs.busy}>{savePrefs.busy ? "Salvando..." : "Entrar na Constelação"}</button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}

function SongForm({ song, onClose, onSaved }) {
  const { call } = useApp();
  const { submit, busy, error } = useSubmit(async (body) => (song ? call(`/lunar/songs/${song.id}`, { method: "PATCH", body }) : call("/lunar/songs", { method: "POST", body })), {
    onDone: (saved) => onSaved(saved),
  });
  return (
    <Modal title={song ? "Editar indicação" : "Indicar uma música"} onClose={onClose}>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          submit(Object.fromEntries(new FormData(event.currentTarget)));
        }}
      >
        {song ? (
          <p className="hint">
            {song.title}
            {song.artist ? `, ${song.artist}` : ""}. Para trocar a música, exclua e indique de novo.
          </p>
        ) : (
          <label>
            Link do Spotify
            <input name="url" required inputMode="url" placeholder="https://open.spotify.com/track/…" autoFocus />
            <small className="hint">Música, álbum, playlist ou podcast. No Spotify: Compartilhar → Copiar link.</small>
          </label>
        )}
        <label>
          Mood da indicação
          <select name="category" required defaultValue={song?.category || ""}>
            <option value="" disabled>
              Escolha
            </option>
            {songCategories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Comentário (opcional)
          <textarea name="comment" rows={2} maxLength={280} defaultValue={song?.comment || ""} placeholder="Ex.: perfeita para resumo de madrugada" />
        </label>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={busy}>{busy ? (song ? "Salvando..." : "Consultando o Spotify...") : song ? "Salvar" : "Indicar"}</button>
        </div>
      </form>
    </Modal>
  );
}

function Radio() {
  const { call, reloadLunar, toast } = useApp();
  const [filter, setFilter] = useState("");
  const [state, setState] = useState({ status: "loading", items: [] });
  const [form, setForm] = useState(null);
  const [playing, setPlaying] = useState("");
  const [removing, setRemoving] = useState(null);
  const load = useCallback(async () => {
    try {
      setState({ status: "ready", items: await call(`/lunar/songs${filter ? `?categoria=${encodeURIComponent(filter)}` : ""}`) });
    } catch {
      setState((current) => ({ ...current, status: "error" }));
    }
  }, [call, filter]);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <section className="moon-section" aria-labelledby="radio">
      <div className="section-head">
        <h2 className="section-title" id="radio">Rádio das Estrelinhas</h2>
        <button className="btn soft small" onClick={() => setForm({})}>
          <Plus size={15} /> Indicar uma música
        </button>
      </div>
      <div className="mood-tabs" role="tablist" aria-label="Filtrar indicações">
        {[["", "Todas"], ...songCategories.map((category) => [category, category])].map(([id, label]) => (
          <button key={id || "todas"} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "active" : ""} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      {state.status === "loading" ? (
        <p className="quiet">Sintonizando a rádio...</p>
      ) : state.status === "error" ? (
        <p className="quiet">A rádio não abriu agora. Tente de novo em instantes.</p>
      ) : state.items.length ? (
        <ul className="song-grid">
          {state.items.map((song) => (
            <li key={song.id} className="song-card">
              {playing === song.id ? (
                <iframe
                  title={`Player do Spotify: ${song.title}`}
                  src={`https://open.spotify.com/embed/${song.type}/${song.spotifyId}?utm_source=generator&theme=0`}
                  height="152"
                  loading="lazy"
                  allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                />
              ) : (
                <button type="button" className="song-cover" onClick={() => setPlaying(song.id)} aria-label={`Ouvir ${song.title} aqui`}>
                  {song.image ? <img src={song.image} alt="" loading="lazy" width="96" height="96" /> : <Music2 size={30} aria-hidden="true" />}
                  <span className="song-play" aria-hidden="true">
                    <Play size={16} />
                  </span>
                </button>
              )}
              <div className="song-info">
                <span className="song-tag">{song.category}</span>
                <strong>{song.title}</strong>
                {song.artist && <span>{song.artist}</span>}
                <small>Indicado por {song.mine ? "você" : song.author.name}</small>
                {song.comment && <p>“{song.comment}”</p>}
                <div className="song-actions">
                  <a className="link-btn" href={song.url} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} /> Abrir no Spotify
                  </a>
                  {song.mine && (
                    <>
                      <button className="icon-btn" aria-label={`Editar indicação de ${song.title}`} onClick={() => setForm({ song })}>
                        <Pencil size={14} />
                      </button>
                      <button className="icon-btn" aria-label={`Excluir indicação de ${song.title}`} onClick={() => setRemoving(song)}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty compact mood="sleepy" title={filter ? `Nenhuma indicação de ${filter} ainda.` : "A rádio ainda está em silêncio."}>
          Indique a primeira música e ganhe a Relíquia Musical.
        </Empty>
      )}
      {form && (
        <SongForm
          song={form.song}
          onClose={() => setForm(null)}
          onSaved={async () => {
            toast(form.song ? "Indicação atualizada." : "Música indicada na Rádio das Estrelinhas.");
            setForm(null);
            await Promise.all([load(), reloadLunar()]);
          }}
        />
      )}
      {removing && (
        <Confirm
          title="Excluir indicação"
          message={`A indicação de “${removing.title}” sai da rádio para todo mundo.`}
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await call(`/lunar/songs/${removing.id}`, { method: "DELETE" });
            await Promise.all([load(), reloadLunar()]);
            toast("Indicação excluída.");
          }}
        />
      )}
    </section>
  );
}

export default function Moon() {
  const { data } = useApp();
  // A data de "hoje" vem do servidor (horário de São Paulo), a mesma usada para gravar o mood.
  const today = data.lunarToday || new Date().toISOString().slice(0, 10);
  const current = data.moods.find((record) => record.date === today);
  return (
    <div className="page moon-page">
      <MoodPicker key={current?.mood || "novo"} today={today} current={current} />
      <LunarHistory records={data.moods} today={today} />
      <Constellation today={today} />
      <Radio />
    </div>
  );
}
