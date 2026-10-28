import { useEffect, useMemo, useState } from "react";
import { Camera, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { Avatar, FormError } from "../ui.jsx";

// Recorta a imagem no centro e reduz para 320 px em JPEG, para a foto ficar leve (bem abaixo de 400 KB).
function squareJpeg(file, size = 320) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const side = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = Object.assign(document.createElement("canvas"), { width: size, height: size });
      canvas.getContext("2d").drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível preparar a imagem."))), "image/jpeg", 0.86);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Este arquivo não parece ser uma imagem. Use JPG, PNG ou WEBP."));
    };
    image.src = url;
  });
}

const toBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });

export default function ProfilePhoto() {
  const { user, call, setUser, toast } = useApp();
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previewUrl = useMemo(() => (preview ? URL.createObjectURL(preview) : ""), [preview]);
  useEffect(() => () => previewUrl && URL.revokeObjectURL(previewUrl), [previewUrl]);

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (file.size > 15 * 1024 * 1024) return setError("Escolha uma imagem de até 15 MB.");
    try {
      setPreview(await squareJpeg(file));
    } catch (failure) {
      setError(failure.message);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      setUser(await call("/me/avatar", { method: "PUT", body: { mime: "image/jpeg", data: await toBase64(preview) } }));
      setPreview(null);
      toast("Foto de perfil atualizada.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const removePhoto = async () => {
    setBusy(true);
    setError("");
    try {
      setUser(await call("/me/avatar", { method: "DELETE" }));
      toast("Foto removida.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="profile-photo">
      {preview ? <img className="avatar-img" src={previewUrl} alt="Prévia da nova foto" width={84} height={84} /> : <Avatar user={user} size={84} />}
      <div>
        {preview ? (
          <>
            <p>Assim vai ficar sua foto. Confirmar?</p>
            <div className="form-actions">
              <button type="button" className="btn ghost" disabled={busy} onClick={() => setPreview(null)}>
                Cancelar
              </button>
              <button type="button" className="btn primary" disabled={busy} onClick={confirm}>
                {busy ? "Salvando..." : "Usar esta foto"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="hint">{user.avatarVersion ? "Sua foto aparece no topo, no Início, no seu perfil e no Conselho dos Bruxinhos." : "Sem foto, mostramos suas iniciais."}</p>
            <div className="form-actions">
              <label className="btn">
                <Camera size={15} /> {user.avatarVersion ? "Trocar foto" : "Escolher foto"}
                <input type="file" accept="image/jpeg,image/png,image/webp,image/*" className="sr-only" onChange={choose} />
              </label>
              {user.avatarVersion && (
                <button type="button" className="btn ghost" disabled={busy} onClick={removePhoto}>
                  <Trash2 size={14} /> Remover
                </button>
              )}
            </div>
          </>
        )}
        <FormError>{error}</FormError>
      </div>
    </div>
  );
}
