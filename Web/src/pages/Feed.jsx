import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, CloudOff, Hourglass, ImageOff, ImagePlus, MessageCircle, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { apiBase, fileToBase64 } from "../lib/api.js";
import { afterPostMessage, kantinhoImage, kantinhoSmall, todaysInspiration } from "../lib/kantinho.js";
import { authorUser, expiresIn, when } from "../lib/social.js";
import { Avatar, Confirm, FormError, Modal } from "../ui.jsx";

// Feed dos Migles: fotos de estudo de toda a comunidade, que somem em 24 horas.
// O Kantinho traz uma inspiração por dia; a primeira foto do dia vale +200 XP.
const photoUrl = (id) => `${apiBase}/feed/${id}/foto`;
const maxSide = 1600;
const maxBytes = 650 * 1024;
const likeEmoji = "❤️";
const pollEvery = 30_000;

// Reduz a foto no próprio aparelho (respeitando a orientação da câmera) e devolve um JPEG leve.
async function preparePhoto(file) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem (JPG, PNG, WEBP ou foto da câmera).");
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Não foi possível abrir esta imagem. Tente uma foto em JPG ou PNG.");
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const quality of [0.85, 0.75, 0.65, 0.55]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= maxBytes) return { blob, width: canvas.width, height: canvas.height };
  }
  throw new Error("A foto ficou grande demais mesmo reduzida. Tente outra imagem.");
}

// Proporção da moldura: entre 4:5 (vertical) e 1,91:1 (horizontal). A foto aparece inteira dentro dela.
const frameRatio = (photo) => {
  const ratio = photo.width && photo.height ? photo.width / photo.height : 1;
  return Math.min(1.91, Math.max(0.8, ratio));
};

// A própria imagem oficial do Kantinho; o "humor" muda só o movimento e o brilho ao redor.
export function Kantinho({ size = 140, mood = "calm", small = false }) {
  return (
    <span className={`kantinho kantinho-${mood}`} style={{ "--kantinho-size": `${size}px` }} aria-hidden="true">
      <img src={small ? kantinhoSmall : kantinhoImage} alt="" width={size} height={Math.round(size * 1.37)} loading="lazy" decoding="async" />
      <i className="kantinho-spark s1" />
      <i className="kantinho-spark s2" />
      <i className="kantinho-spark s3" />
    </span>
  );
}

function KantinhoMessage({ inspiration, onShoot }) {
  return (
    <div className="kantinho-speech">
      <p>
        <strong>Oooi, viajante! ✨ Eu sou o Kantinho, seu duende blogueiro e fotógrafo oficial do Grimiau!</strong>
      </p>
      <p>
        Está sem ideias para sua próxima foto? Não se preocupe, eu tenho uma ajudinha mágica para você! Todos os dias, trago uma nova inspiração para transformar seus momentos de estudo em registros dignos de um grimório.
      </p>
      <p>Você não precisa seguir minhas sugestões, viu? Elas são apenas pequenas faíscas de criatividade para despertar seu lado fotógrafo!</p>
      <p className="kantinho-today">
        <span>📸 A inspiração mágica de hoje é:</span>
        <strong>{inspiration}</strong>
      </p>
      <p>Prepare a câmera, capriche no flash e mostre ao Grimiau um pedacinho do seu universo!</p>
      <button type="button" className="btn primary" onClick={onShoot}>
        <Camera size={16} /> Publicar uma foto
      </button>
    </div>
  );
}

// Convite compacto: no celular fica no topo; no computador, no painel ao lado.
function KantinhoInvite({ inspiration, xpAvailable, onShoot, onMore }) {
  return (
    <section className="feed-invite" aria-labelledby="feed-invite-title">
      <Kantinho size={76} mood="calm" small />
      <div className="feed-invite-text">
        <h2 id="feed-invite-title">Uma inspiração do Kantinho para hoje ✨</h2>
        <p className="feed-invite-quote">“{inspiration}”</p>
        {xpAvailable !== null && (
          <p className={`feed-xp ${xpAvailable ? "is-open" : ""}`}>
            <Sparkles size={14} aria-hidden="true" /> {xpAvailable ? "Sua primeira foto de hoje vale +200 XP" : "Você já ganhou os +200 XP da foto de hoje"}
          </p>
        )}
        <div className="feed-invite-actions">
          <button type="button" className="btn primary" onClick={onShoot}>
            <Camera size={16} /> Publicar foto
          </button>
          <button type="button" className="btn ghost" onClick={onMore}>
            Ver inspiração do dia
          </button>
        </div>
      </div>
    </section>
  );
}

function UploadForm({ inspiration, xpAvailable, onClose, onPosted }) {
  const { call } = useApp();
  const [photo, setPhoto] = useState(null);
  const [caption, setCaption] = useState("");
  const [inspired, setInspired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo.blob) : ""), [photo]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const pick = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      setPhoto(await preparePhoto(file));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const publish = async (event) => {
    event.preventDefault();
    if (!photo) return setError("Escolha uma foto primeiro.");
    setBusy(true);
    setError("");
    try {
      const saved = await call("/feed", {
        method: "POST",
        body: { mime: "image/jpeg", data: await fileToBase64(photo.blob), width: photo.width, height: photo.height, caption, inspired, inspiration: inspired ? inspiration : "" },
      });
      onPosted(saved);
    } catch (failure) {
      setError(failure instanceof TypeError ? "Sem conexão. A foto não foi enviada; tente de novo quando a internet voltar." : `A foto não foi enviada. ${failure.message}`);
      setBusy(false);
    }
  };

  return (
    <Modal title="Nova foto no Feed dos Migles" onClose={onClose}>
      <form className="form" onSubmit={publish}>
        <label className={`feed-picker ${photo ? "has-photo" : ""}`}>
          {photo ? <img src={preview} alt="Prévia da foto escolhida" /> : <span><ImagePlus size={28} aria-hidden="true" /> {busy ? "Preparando a foto..." : "Escolher foto ou abrir a câmera"}</span>}
          <input type="file" accept="image/*" className="sr-only" onChange={pick} disabled={busy} />
        </label>
        {photo && <small className="hint">Toque na foto para trocar.</small>}
        <label>
          Legenda (opcional)
          <textarea rows={3} maxLength={300} value={caption} onChange={(event) => setCaption(event.target.value)} placeholder="Conte o que aparece na foto." />
        </label>
        <label className="check">
          <input type="checkbox" checked={inspired} onChange={(event) => setInspired(event.target.checked)} /> Usei a inspiração do Kantinho de hoje
        </label>
        <p className="hint">
          A foto fica no Feed por 24 horas e depois é apagada. {xpAvailable ? "A primeira foto do dia vale +200 XP." : ""} Toda a comunidade vê. Não publique documentos, rostos de quem não autorizou nem dados pessoais.
        </p>
        <FormError>{error}</FormError>
        <div className="form-actions">
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy || !photo}>
            {busy && photo ? "Publicando..." : "Publicar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Posted({ photo, onClose }) {
  return (
    <Modal title={photo.inspired ? "Foto publicada com magia!" : "Foto publicada!"} onClose={onClose}>
      <div className="feed-posted">
        <div className="feed-celebrate" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <i key={index} style={{ "--i": index }} />
          ))}
          <Kantinho size={120} mood="party" />
        </div>
        <p>{photo.inspired ? afterPostMessage : "Sua foto já está no Feed dos Migles."}</p>
        {photo.xpAwarded > 0 && <p className="feed-posted-xp">+{photo.xpAwarded} XP pela foto de hoje ✨</p>}
        <button type="button" className="btn primary" onClick={onClose}>
          Ver no Feed
        </button>
      </div>
    </Modal>
  );
}

function PhotoCard({ photo, index, onChange, onDelete }) {
  const { call, toast } = useApp();
  const [broken, setBroken] = useState(false);
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [burst, setBurst] = useState("");
  const like = photo.reactions.find((item) => item.emoji === likeEmoji);
  const others = photo.reactions.filter((item) => item.emoji !== likeEmoji);
  const react = async (emoji) => {
    const was = photo.reactions.find((item) => item.emoji === emoji)?.reacted;
    if (!was) {
      setBurst(emoji);
      setTimeout(() => setBurst(""), 700);
    }
    try {
      onChange(await call(`/feed/${photo.id}/reactions`, { method: "POST", body: { emoji } }));
    } catch (failure) {
      toast(failure.message);
    }
  };
  const send = async (event) => {
    event.preventDefault();
    if (!comment.trim()) return;
    setBusy(true);
    try {
      onChange(await call(`/feed/${photo.id}/comments`, { method: "POST", body: { body: comment } }));
      setComment("");
    } catch (failure) {
      toast(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className="feed-post" style={{ "--delay": `${Math.min(index, 6) * 60}ms` }}>
      <header className="feed-post-head">
        <Avatar user={authorUser(photo.author)} size={36} />
        <span className="feed-post-who">
          <strong>{photo.author.name}</strong>
          <small>
            {when(photo.createdAt)} · {new Date(photo.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </small>
        </span>
        <span className="feed-post-expires" title="Cada foto fica 24 horas no Feed">
          <Hourglass size={13} aria-hidden="true" /> {expiresIn(photo.expiresAt)}
        </span>
        {photo.mine && (
          <button type="button" className="icon-btn" aria-label="Apagar minha foto" title="Apagar minha foto" onClick={() => onDelete(photo)}>
            <Trash2 size={16} />
          </button>
        )}
      </header>
      <div className="feed-photo" style={{ aspectRatio: frameRatio(photo) }}>
        {broken ? (
          <div className="feed-photo-missing">
            <ImageOff size={26} aria-hidden="true" />
            <span>Esta foto não está mais disponível.</span>
          </div>
        ) : (
          <img
            src={photoUrl(photo.id)}
            alt={photo.caption || `Foto de ${photo.author.name}`}
            loading={index < 2 ? "eager" : "lazy"}
            decoding="async"
            width={photo.width || undefined}
            height={photo.height || undefined}
            onError={() => setBroken(true)}
            onDoubleClick={() => !like?.reacted && react(likeEmoji)}
          />
        )}
        {burst === likeEmoji && <span className="feed-heart-burst" aria-hidden="true">❤️</span>}
      </div>
      <div className="feed-post-actions">
        <button type="button" className={`feed-like ${like?.reacted ? "active" : ""}`} aria-pressed={Boolean(like?.reacted)} aria-label={like?.reacted ? "Descurtir" : "Curtir"} onClick={() => react(likeEmoji)}>
          <span aria-hidden="true">{likeEmoji}</span>
          {like?.count > 0 && <small>{like.count}</small>}
        </button>
        <button type="button" className="feed-comment-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
          <MessageCircle size={18} aria-hidden="true" /> {photo.comments.length ? photo.comments.length : ""}
          <span className="sr-only">{photo.comments.length === 1 ? "comentário" : "comentários"}</span>
        </button>
        <div className="reaction-row feed-reactions" role="group" aria-label="Reagir à foto">
          {others.map((item) => (
            <button key={item.emoji} type="button" className={`reaction ${item.reacted ? "active" : ""} ${burst === item.emoji ? "is-popping" : ""}`} aria-pressed={item.reacted} aria-label={`${item.emoji} ${item.count}`} onClick={() => react(item.emoji)}>
              <span aria-hidden="true">{item.emoji}</span> {item.count > 0 && <small>{item.count}</small>}
            </button>
          ))}
        </div>
      </div>
      {(photo.caption || photo.inspired) && (
        <div className="feed-caption">
          {photo.caption && (
            <p>
              <strong>{photo.author.name}</strong> {photo.caption}
            </p>
          )}
          {photo.inspired && (
            <p className="feed-inspired">
              <Kantinho size={22} small /> {afterPostMessage}
            </p>
          )}
        </div>
      )}
      {!open && photo.comments.length > 0 && (
        <button type="button" className="link-btn feed-see-comments" onClick={() => setOpen(true)}>
          Ver {photo.comments.length === 1 ? "o comentário" : `os ${photo.comments.length} comentários`}
        </button>
      )}
      {open && (
        <div className="feed-comments">
          {photo.comments.length === 0 && <p className="quiet">Ninguém comentou ainda. Que tal deixar a primeira estrelinha? ✨</p>}
          {photo.comments.map((entry) => (
            <div key={entry.id} className="tarot-reply">
              <Avatar user={authorUser(entry.author)} size={26} />
              <p>
                <strong>{entry.author.name}</strong> <small>{when(entry.createdAt)}</small>
                <br />
                <span className="prewrap">{entry.body}</span>
              </p>
              {entry.mine && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Apagar meu comentário"
                  onClick={async () => {
                    await call(`/feed/comments/${entry.id}`, { method: "DELETE" });
                    onChange({ ...photo, comments: photo.comments.filter((other) => other.id !== entry.id) });
                  }}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          <form className="form tarot-reply-form" onSubmit={send}>
            <input value={comment} maxLength={500} onChange={(event) => setComment(event.target.value)} placeholder="Escreva um comentário" aria-label="Comentário" />
            <button className="btn small primary" disabled={busy || !comment.trim()}>
              Enviar
            </button>
          </form>
        </div>
      )}
    </li>
  );
}

function FeedSkeleton() {
  return (
    <ul className="feed-list" aria-hidden="true">
      {[0, 1].map((item) => (
        <li key={item} className="feed-post is-skeleton">
          <div className="feed-post-head">
            <span className="skeleton-dot" />
            <span className="skeleton-line" />
          </div>
          <div className="feed-photo" style={{ aspectRatio: 1 }} />
        </li>
      ))}
    </ul>
  );
}

export default function Feed() {
  const { call, toast } = useApp();
  const inspiration = todaysInspiration();
  const [state, setState] = useState({ status: "loading", photos: [], more: false, error: "" });
  const [xpAvailable, setXpAvailable] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [posted, setPosted] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [message, setMessage] = useState(false);
  const loadedOlder = useRef(false);

  // Junta a primeira página com o que já está na tela (sem perder as fotos antigas já carregadas)
  // e tira as que passaram das 24 horas.
  const merge = (current, fresh) => {
    const now = Date.now();
    const byId = new Map(fresh.map((item) => [item.id, item]));
    const kept = current.filter((item) => !byId.has(item.id) && new Date(item.expiresAt).getTime() > now && (loadedOlder.current || fresh.length === 30));
    return [...fresh, ...kept].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  };

  const load = useCallback(
    async (before) => {
      try {
        const page = await call(`/feed${before ? `?antes=${encodeURIComponent(before)}` : ""}`);
        if (before) loadedOlder.current = true;
        setState((current) => ({ status: "ready", photos: before ? [...current.photos, ...page] : merge(current.photos, page), more: before ? page.length === 30 : current.more || page.length === 30, error: "" }));
      } catch (failure) {
        setState((current) => ({ ...current, status: current.photos.length ? "ready" : "error", error: failure instanceof TypeError || !navigator.onLine ? "offline" : failure.message }));
      }
    },
    [call],
  );
  useEffect(() => {
    load();
    call("/feed/hoje")
      .then((today) => setXpAvailable(today.xpAvailable))
      .catch(() => {});
    const timer = setInterval(() => document.visibilityState === "visible" && load(), pollEvery);
    return () => clearInterval(timer);
  }, [load, call]);

  const replace = (photo) => setState((current) => ({ ...current, photos: current.photos.map((item) => (item.id === photo.id ? photo : item)) }));
  const shoot = () => setUploading(true);

  return (
    <div className="page feed">
      <div className="feed-aura" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <i key={index} style={{ "--i": index }} />
        ))}
      </div>
      <header className="page-head feed-head">
        <div>
          <h1>Feed dos Migles</h1>
          <p>Um diário visual da comunidade. Cada foto fica 24 horas e depois vira poeira de estrelas.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={shoot}>
            <Camera size={16} /> Nova foto
          </button>
        </div>
      </header>

      <div className="feed-layout">
        <aside className="feed-side">
          <KantinhoInvite inspiration={inspiration} xpAvailable={xpAvailable} onShoot={shoot} onMore={() => setMessage(true)} />
        </aside>
        <div className="feed-main">
          {state.status === "loading" ? (
            <FeedSkeleton />
          ) : state.status === "error" ? (
            <div className="feed-state">
              <CloudOff size={30} aria-hidden="true" />
              <strong>{state.error === "offline" ? "Parece que a internet sumiu por um instante." : "O Feed não abriu agora."}</strong>
              <p>{state.error === "offline" ? "Quando a conexão voltar, as fotos aparecem de novo." : state.error}</p>
              <button className="btn small" onClick={() => load()}>
                <RefreshCw size={14} /> Tentar de novo
              </button>
            </div>
          ) : state.photos.length ? (
            <>
              <ul className="feed-list">
                {state.photos.map((photo, index) => (
                  <PhotoCard key={photo.id} photo={photo} index={index} onChange={replace} onDelete={setRemoving} />
                ))}
              </ul>
              {state.more && (
                <button className="btn ghost feed-more" onClick={() => load(state.photos[state.photos.length - 1].createdAt)}>
                  Carregar fotos mais antigas
                </button>
              )}
            </>
          ) : (
            <div className="feed-state is-empty">
              <Kantinho size={96} mood="calm" small />
              <strong>Seu universo ainda está em silêncio…</strong>
              <p>Que tal ser a primeira pessoa a deixar uma estrelinha por aqui? ✨</p>
              <button className="btn primary" onClick={shoot}>
                <Camera size={16} /> Publicar a primeira foto
              </button>
            </div>
          )}
        </div>
      </div>

      {message && (
        <Modal title="A inspiração do Kantinho" onClose={() => setMessage(false)}>
          <div className="kantinho-card is-modal">
            <Kantinho size={110} mood="calm" />
            <KantinhoMessage
              inspiration={inspiration}
              onShoot={() => {
                setMessage(false);
                shoot();
              }}
            />
          </div>
        </Modal>
      )}
      {uploading && (
        <UploadForm
          inspiration={inspiration}
          xpAvailable={xpAvailable}
          onClose={() => setUploading(false)}
          onPosted={(photo) => {
            setUploading(false);
            setPosted(photo);
            if (photo.xpAwarded) setXpAvailable(false);
            setState((current) => ({ ...current, status: "ready", photos: [photo, ...current.photos.filter((item) => item.id !== photo.id)] }));
          }}
        />
      )}
      {posted && <Posted photo={posted} onClose={() => setPosted(null)} />}
      {removing && (
        <Confirm
          title="Apagar foto"
          message="A foto sai do Feed dos Migles para todo mundo. Não dá para desfazer."
          confirmLabel="Apagar foto"
          onClose={() => setRemoving(null)}
          onConfirm={async () => {
            await call(`/feed/${removing.id}`, { method: "DELETE" });
            setState((current) => ({ ...current, photos: current.photos.filter((item) => item.id !== removing.id) }));
            toast("Foto apagada.");
          }}
        />
      )}
    </div>
  );
}
