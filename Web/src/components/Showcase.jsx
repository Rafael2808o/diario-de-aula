import { useEffect, useState } from "react";
import { BookMarked, Camera, Flame, Music, Pencil, Star, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { apiBase } from "../lib/api.js";
import { blobToBase64, preparePhoto } from "../lib/photo.js";
import { Avatar, FormError, Modal } from "../ui.jsx";

// Apresentação do perfil (versão 4.0): capa, cor, frase, música, leitura atual, matéria favorita e o que a pessoa
// mais estudou nos últimos 30 dias (calculado do Ritual). Nada de dados acadêmicos ou de contato.
const themeLabels = { noite: "Noite", aurora: "Aurora", pergaminho: "Pergaminho", floresta: "Floresta", mar: "Mar" };

function useCover(userId, version) {
  const { session } = useApp();
  const [url, setUrl] = useState("");
  useEffect(() => {
    if (!version) return setUrl("");
    let alive = true;
    let made = "";
    fetch(`${apiBase}/vitrine/capa/${userId}?v=${version}`, { headers: { Authorization: `Bearer ${session.token}` } })
      .then((response) => (response.ok ? response.blob() : null))
      .then((blob) => {
        if (!alive || !blob) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [userId, version, session.token]);
  return url;
}

// Céu da capa quando a pessoa não colocou foto (referência "Perfil do Grimiau", 18/11/2026).
// As cores mudam com o tema da capa (caderno.css: .theme-*). Estrelas em posições fixas para não "pular".
const skyStars = Array.from({ length: 38 }, (_, index) => {
  const x = (index * 97.3) % 1000;
  const y = (index * 53.7) % 150;
  return { x, y, r: index % 5 === 0 ? 1.6 : 0.9, d: (index % 7) * 0.6 };
});
function CoverSky() {
  return (
    <svg className="showcase-sky" viewBox="0 0 1000 240" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--sky-a)" />
          <stop offset="1" stopColor="var(--sky-b)" />
        </linearGradient>
        <radialGradient id="sc-glow">
          <stop offset="0" stopColor="var(--moon)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--moon)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1000" height="240" fill="url(#sc-sky)" />
      {skyStars.map((star, index) => (
        <circle key={index} className="sc-star" cx={star.x} cy={star.y} r={star.r} style={{ animationDelay: `-${star.d}s` }} />
      ))}
      <circle cx="790" cy="70" r="95" fill="url(#sc-glow)" />
      <circle cx="790" cy="70" r="42" fill="var(--moon)" />
      <path d="M0 190 Q160 150 320 178 T640 170 T1000 176 V240 H0Z" fill="var(--hill-a)" />
      <path d="M0 214 Q220 186 440 206 T1000 200 V240 H0Z" fill="var(--hill-b)" />
    </svg>
  );
}

export function ShowcaseCard({ person, showcase, onEdit, title }) {
  const cover = useCover(person.id, showcase.coverVersion);
  const studied = showcase.mostStudied;
  const mine = Boolean(onEdit);
  const hasNote = showcase.headline || showcase.favoriteSubject || studied?.subject;
  return (
    <section className={`showcase theme-${showcase.coverTheme || "noite"}`} style={showcase.accent ? { "--showcase-accent": showcase.accent } : undefined} aria-label="Apresentação">
      <div className="showcase-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        {!cover && <CoverSky />}
        {mine && (
          <button type="button" className="btn small soft showcase-edit" onClick={onEdit}>
            <Camera size={14} /> Trocar capa
          </button>
        )}
      </div>
      <div className="showcase-body">
        <Avatar user={person} size={112} className="showcase-avatar" />
        <div className="showcase-who">
          <h1>{person.name}</h1>
          <div className="showcase-tags">
            {title && (
              <span className="showcase-title">
                <Star size={12} aria-hidden="true" /> {title}
              </span>
            )}
            {person.course && <small>{person.course}</small>}
          </div>
        </div>
        {mine && (
          <button type="button" className="btn primary showcase-edit-main" onClick={onEdit}>
            <Pencil size={15} /> Editar perfil
          </button>
        )}
      </div>
      {(hasNote || showcase.musicUrl || showcase.musicTitle || showcase.readingTitle || mine) && (
        <div className="showcase-cards">
          {hasNote ? (
            <article className="showcase-note">
              <span className="showcase-tape" aria-hidden="true" />
              <p className="showcase-note-label">sobre mim</p>
              {showcase.headline && <p className="showcase-note-text">{showcase.headline}</p>}
              <div className="showcase-note-tags">
                {showcase.favoriteSubject && (
                  <span>
                    <i aria-hidden="true" /> matéria favorita · <b>{showcase.favoriteSubject}</b>
                  </span>
                )}
                {studied?.subject && (
                  <span>
                    <Flame size={12} aria-hidden="true" /> mais estudado em 30 dias · <b>{studied.subject.name}{studied.topic ? ` · ${studied.topic.name}` : ""}</b>
                  </span>
                )}
              </div>
            </article>
          ) : (
            mine && (
              <button type="button" className="showcase-note is-empty" onClick={onEdit}>
                <span className="showcase-tape" aria-hidden="true" />
                <p className="showcase-note-label">sobre mim</p>
                <p className="showcase-note-text">Escreva uma frase sobre você e escolha sua matéria favorita.</p>
              </button>
            )
          )}
          {showcase.musicUrl || showcase.musicTitle ? (
            <article className="showcase-tile showcase-now">
              <span className="showcase-vinyl" aria-hidden="true"><i /></span>
              <div>
                <p className="showcase-kicker">
                  <Music size={12} aria-hidden="true" /> Meu momento
                </p>
                <strong>{showcase.musicTitle || "Música do perfil"}</strong>
                {showcase.musicUrl && (
                  <a className="showcase-listen" href={showcase.musicUrl} target="_blank" rel="noopener noreferrer">
                    Ouvir <small>abre em outro app</small>
                  </a>
                )}
              </div>
            </article>
          ) : (
            mine && (
              <button type="button" className="showcase-tile showcase-now is-empty" onClick={onEdit}>
                <span className="showcase-vinyl" aria-hidden="true"><i /></span>
                <div>
                  <p className="showcase-kicker">Meu momento</p>
                  <strong>Escolha uma música</strong>
                </div>
              </button>
            )
          )}
          {showcase.readingTitle ? (
            <article className="showcase-tile showcase-reading">
              <span className="showcase-book" aria-hidden="true"><span>{showcase.readingTitle}</span></span>
              <div>
                <p className="showcase-kicker">
                  <BookMarked size={12} aria-hidden="true" /> Lendo agora
                </p>
                <strong>{showcase.readingTitle}</strong>
                {showcase.readingAuthor && <small>{showcase.readingAuthor}</small>}
              </div>
            </article>
          ) : (
            mine && (
              <button type="button" className="showcase-tile showcase-reading is-empty" onClick={onEdit}>
                <span className="showcase-book" aria-hidden="true" />
                <div>
                  <p className="showcase-kicker">Lendo agora</p>
                  <strong>Conte o que está lendo</strong>
                </div>
              </button>
            )
          )}
        </div>
      )}
    </section>
  );
}

export function ShowcaseEditor({ showcase, onClose, onSaved }) {
  const { call, data, toast } = useApp();
  const [form, setForm] = useState({
    headline: showcase.headline,
    accent: showcase.accent,
    coverTheme: showcase.coverTheme || "noite",
    musicTitle: showcase.musicTitle,
    musicUrl: showcase.musicUrl,
    readingTitle: showcase.readingTitle,
    readingAuthor: showcase.readingAuthor,
    favoriteSubject: showcase.favoriteSubject,
    visible: showcase.visible,
  });
  const [coverVersion, setCoverVersion] = useState(showcase.coverVersion);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const uploadCover = async (file) => {
    if (!file) return;
    setBusy("capa");
    setError("");
    try {
      const photo = await preparePhoto(file, { maxSide: 1600, maxBytes: 650 * 1024 });
      const result = await call("/vitrine/capa", { method: "PUT", body: { mime: "image/jpeg", data: await blobToBase64(photo.blob) } });
      setCoverVersion(result.coverVersion);
      toast("Capa atualizada.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy("salvar");
    setError("");
    try {
      const saved = await call("/vitrine", { method: "PUT", body: form });
      onSaved({ ...saved, coverVersion });
      toast("Apresentação salva.");
    } catch (failure) {
      setError(failure.message);
      setBusy("");
    }
  };
  return (
    <Modal title="Personalizar meu perfil" onClose={() => onSaved({ ...showcase, coverVersion })}>
      <form className="form" onSubmit={save}>
        <fieldset className="plain-fieldset">
          <legend>Capa</legend>
          <div className="paper-picker" role="radiogroup" aria-label="Fundo da capa">
            {showcase.themes.map((theme) => (
              <button key={theme} type="button" role="radio" aria-checked={form.coverTheme === theme} className={`showcase-swatch theme-${theme}`} onClick={() => setForm({ ...form, coverTheme: theme })}>
                {themeLabels[theme] || theme}
              </button>
            ))}
          </div>
          <div className="form-actions start">
            <label className="btn soft small">
              <Camera size={14} /> {busy === "capa" ? "Enviando..." : coverVersion ? "Trocar foto da capa" : "Usar uma foto"}
              <input type="file" accept="image/*" hidden onChange={(event) => uploadCover(event.target.files[0])} />
            </label>
            {coverVersion && (
              <button
                type="button"
                className="btn small"
                onClick={async () => {
                  await call("/vitrine/capa", { method: "PUT", body: {} });
                  setCoverVersion("");
                }}
              >
                <Trash2 size={14} /> Tirar foto
              </button>
            )}
          </div>
        </fieldset>
        <fieldset className="plain-fieldset">
          <legend>Cor do perfil</legend>
          <div className="paper-picker" role="radiogroup" aria-label="Cor do perfil">
            {showcase.accents.map((color) => (
              <button key={color} type="button" role="radio" aria-checked={form.accent === color} aria-label={`Cor ${color}`} className="color-dot" style={{ background: color }} onClick={() => setForm({ ...form, accent: form.accent === color ? "" : color })} />
            ))}
          </div>
        </fieldset>
        <label>
          Frase curta
          <input value={form.headline} maxLength={120} onChange={set("headline")} placeholder="Ex.: Publicitária em formação, viciada em café" />
        </label>
        <div className="form-row">
          <label>
            Matéria favorita
            <input value={form.favoriteSubject} maxLength={80} onChange={set("favoriteSubject")} list="showcase-subjects" />
            <datalist id="showcase-subjects">
              {data.subjects.map((subject) => (
                <option key={subject.id} value={subject.name} />
              ))}
            </datalist>
          </label>
          <label>
            Lendo agora
            <input value={form.readingTitle} maxLength={120} onChange={set("readingTitle")} placeholder="Título do livro" />
          </label>
        </div>
        <label>
          Autor (opcional)
          <input value={form.readingAuthor} maxLength={80} onChange={set("readingAuthor")} />
        </label>
        <div className="form-row">
          <label>
            Música do perfil
            <input value={form.musicTitle} maxLength={100} onChange={set("musicTitle")} placeholder="Ex.: Lo-fi para estudar" />
          </label>
          <label>
            Link (Spotify, YouTube Music…)
            <input type="url" value={form.musicUrl} maxLength={300} onChange={set("musicUrl")} placeholder="https://open.spotify.com/…" />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.visible} onChange={(event) => setForm({ ...form, visible: event.target.checked })} /> Mostrar minha apresentação para quem está no Grimiau
        </label>
        <p className="hint">“Mais estudado” é calculado sozinho a partir do seu Ritual. Seu nome completo, RA e registros de aula nunca aparecem aqui.</p>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => onSaved({ ...showcase, coverVersion })}>
            Cancelar
          </button>
          <button className="btn primary" disabled={Boolean(busy)}>
            {busy === "salvar" ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// Perfil de outra pessoa (aberto pelo ranking, pela sala de foco ou pelo Perguntados).
export function PublicProfile({ userId }) {
  const { call, go } = useApp();
  const [state, setState] = useState(null);
  useEffect(() => {
    call(`/vitrine/${userId}`).then(setState).catch((failure) => setState({ error: failure.message }));
  }, [call, userId]);
  if (!state) return <div className="page"><p className="quiet">Carregando…</p></div>;
  return (
    <div className="page profile">
      <button className="link-btn" onClick={() => window.history.length > 1 ? window.history.back() : go("comunidade")}>
        Voltar
      </button>
      {state.error ? (
        <p className="notice">{state.error}</p>
      ) : state.hidden ? (
        <section className="showcase-hidden paper-card">
          <Avatar user={state} size={64} />
          <p>
            <strong>{state.name}</strong> preferiu deixar a apresentação só para si.
          </p>
        </section>
      ) : (
        <ShowcaseCard person={state} showcase={state} />
      )}
    </div>
  );
}
