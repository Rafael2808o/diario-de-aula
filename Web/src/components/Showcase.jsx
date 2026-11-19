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

export function ShowcaseCard({ person, showcase, onEdit }) {
  const cover = useCover(person.id, showcase.coverVersion);
  const studied = showcase.mostStudied;
  const facts = [
    showcase.favoriteSubject && { icon: Star, label: "Matéria favorita", value: showcase.favoriteSubject },
    studied?.subject && { icon: Flame, label: "Mais estudado (30 dias)", value: `${studied.subject.name}${studied.topic ? ` · ${studied.topic.name}` : ""}` },
    showcase.readingTitle && { icon: BookMarked, label: "Lendo agora", value: `${showcase.readingTitle}${showcase.readingAuthor ? `, de ${showcase.readingAuthor}` : ""}` },
  ].filter(Boolean);
  return (
    <section className={`showcase theme-${showcase.coverTheme || "noite"}`} style={showcase.accent ? { "--showcase-accent": showcase.accent } : undefined} aria-label="Apresentação">
      <div className="showcase-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
        {onEdit && (
          <button type="button" className="btn small soft showcase-edit" onClick={onEdit}>
            <Pencil size={14} /> Personalizar
          </button>
        )}
      </div>
      <div className="showcase-body">
        <Avatar user={person} size={84} className="showcase-avatar" />
        <div className="showcase-who">
          <h1>{person.name}</h1>
          {showcase.headline && <p className="showcase-headline">{showcase.headline}</p>}
          {person.course && <small>{person.course}</small>}
        </div>
        {facts.length > 0 && (
          <dl className="showcase-facts">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label}>
                <dt>
                  <Icon size={14} aria-hidden="true" /> {label}
                </dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {showcase.musicUrl && (
          <a className="showcase-music" href={showcase.musicUrl} target="_blank" rel="noopener noreferrer">
            <Music size={16} aria-hidden="true" /> {showcase.musicTitle || "Música do perfil"} <small>abre em outro app</small>
          </a>
        )}
      </div>
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
