import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, ImagePlus, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { apiBase, fileToBase64 } from "../lib/api.js";
import { afterPostMessage, kantinhoImage, kantinhoSmall, todaysInspiration } from "../lib/kantinho.js";
import { Avatar, Confirm, Empty, FormError, Modal } from "../ui.jsx";

// Feed dos Migles: fotos de estudo de toda a comunidade, com o Kantinho trazendo uma inspiração por dia.
const photoUrl = (id) => `${apiBase}/feed/${id}/foto`;
const maxSide = 1600;
const maxBytes = 650 * 1024;

const when = (iso) => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  if (minutes < 60 * 24) return `há ${Math.round(minutes / 60)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
};

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

function KantinhoCard({ inspiration, onShoot }) {
  return (
    <section className="kantinho-card" aria-labelledby="kantinho-title">
      <Kantinho size={150} mood="calm" />
      <div className="kantinho-speech">
        <p id="kantinho-title">
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
    </section>
  );
}

function UploadForm({ inspiration, onClose, onPosted }) {
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
      setError(failure.message);
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
        <p className="hint">Toda a comunidade vê o Feed. Aparece só o seu nome público. Não publique documentos, rostos de quem não autorizou nem dados pessoais.</p>
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
        <Kantinho size={130} mood="party" />
        <p>{photo.inspired ? afterPostMessage : "Sua foto já está no Feed dos Migles."}</p>
        <button type="button" className="btn primary" onClick={onClose}>
          Ver no Feed
        </button>
      </div>
    </Modal>
  );
}

function PhotoCard({ photo, onDelete }) {
  return (
    <li className="feed-item">
      <header>
        <Avatar user={photo.author} size={30} />
        <span>
          <strong>{photo.author.name}</strong>
          <small>{when(photo.createdAt)}</small>
        </span>
        {photo.mine && (
          <button type="button" className="icon-btn" aria-label="Apagar minha foto" title="Apagar minha foto" onClick={() => onDelete(photo)}>
            <Trash2 size={15} />
          </button>
        )}
      </header>
      <img src={photoUrl(photo.id)} alt={photo.caption || `Foto de ${photo.author.name}`} loading="lazy" decoding="async" width={photo.width || undefined} height={photo.height || undefined} />
      {(photo.caption || photo.inspired) && (
        <div className="feed-caption">
          {photo.caption && <p>{photo.caption}</p>}
          {photo.inspired && (
            <p className="feed-inspired">
              <Kantinho size={22} small /> {afterPostMessage}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function Feed() {
  const { call, toast } = useApp();
  const inspiration = todaysInspiration();
  const [state, setState] = useState({ status: "loading", photos: [], more: false });
  const [uploading, setUploading] = useState(false);
  const [posted, setPosted] = useState(null);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(
    async (before) => {
      try {
        const page = await call(`/feed${before ? `?antes=${encodeURIComponent(before)}` : ""}`);
        setState((current) => ({ status: "ready", photos: before ? [...current.photos, ...page] : page, more: page.length === 30 }));
      } catch (failure) {
        setState((current) => ({ ...current, status: current.photos.length ? "ready" : "error", error: failure.message }));
      }
    },
    [call],
  );
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page feed">
      <header className="page-head">
        <div>
          <h1>Feed dos Migles</h1>
          <p>Fotos dos momentos de estudo da comunidade do Grimiau.</p>
        </div>
        <div className="page-actions">
          <button className="btn primary" onClick={() => setUploading(true)}>
            <Camera size={16} /> Nova foto
          </button>
        </div>
      </header>

      <KantinhoCard inspiration={inspiration} onShoot={() => setUploading(true)} />

      {state.status === "loading" ? (
        <p className="quiet">Carregando o Feed...</p>
      ) : state.status === "error" ? (
        <Empty title="Não foi possível abrir o Feed.">
          {state.error}
          <button className="btn small" onClick={() => load()}>
            Tentar de novo
          </button>
        </Empty>
      ) : state.photos.length ? (
        <>
          <ul className="feed-grid">
            {state.photos.map((photo) => (
              <PhotoCard key={photo.id} photo={photo} onDelete={setRemoving} />
            ))}
          </ul>
          {state.more && (
            <button className="btn ghost" onClick={() => load(state.photos[state.photos.length - 1].createdAt)}>
              Carregar fotos mais antigas
            </button>
          )}
        </>
      ) : (
        <Empty title="O Feed ainda está sem fotos." mood="happy">
          Seja a primeira pessoa a mostrar um pedacinho do seu universo de estudos.
        </Empty>
      )}

      {uploading && (
        <UploadForm
          inspiration={inspiration}
          onClose={() => setUploading(false)}
          onPosted={(photo) => {
            setUploading(false);
            setPosted(photo);
            setState((current) => ({ ...current, status: "ready", photos: [photo, ...current.photos] }));
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
