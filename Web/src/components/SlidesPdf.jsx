import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileImage, Trash2 } from "lucide-react";
import { useApp } from "../context.js";
import { fileToBase64 } from "../lib/api.js";
import { formatFull, todayIso } from "../lib/dates.js";
import { buildSlidesPdf, photoToJpeg } from "../lib/pdf.js";
import { FormError, Modal } from "../ui.jsx";

const maxBytes = 3 * 1024 * 1024;
const maxPhotos = 40;

// Fotos dos slides → um PDF com capa do Grimiau, salvo como material da aula (e da disciplina).
export function SlidesPdf({ lesson, subject, onClose }) {
  const { create, call, replace, data, toast } = useApp();
  const [photos, setPhotos] = useState([]);
  const [title, setTitle] = useState(`Slides${lesson.theme ? ` — ${lesson.theme}` : ""}`);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const input = useRef(null);
  const urls = useRef([]);

  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addFiles = (files) => {
    setError("");
    const images = [...files].filter((file) => file.type.startsWith("image/"));
    if (images.length < files.length) setError("Só fotos entram no PDF; os outros arquivos foram ignorados.");
    const room = maxPhotos - photos.length;
    if (images.length > room) setError(`Cabem até ${maxPhotos} fotos em um PDF.`);
    const next = images.slice(0, room).map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`, file, url };
    });
    setPhotos((current) => [...current, ...next]);
  };
  const move = (index, delta) =>
    setPhotos((current) => {
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(index + delta, 0, item);
      return next;
    });

  const save = async () => {
    if (!photos.length) return setError("Escolha pelo menos uma foto.");
    setError("");
    try {
      // Comprime até caber no limite de 3 MB por arquivo: primeiro 1600 px, depois menor.
      let pdf;
      for (const [max, quality] of [[1600, 0.8], [1400, 0.7], [1200, 0.62], [1000, 0.55], [800, 0.5]]) {
        setBusy(`Preparando ${photos.length} ${photos.length === 1 ? "foto" : "fotos"}…`);
        const images = [];
        for (const photo of photos) images.push(await photoToJpeg(photo.file, max, quality));
        pdf = buildSlidesPdf({ title: title.trim() || "Slides da aula", subject: subject?.name || "", date: formatFull(lesson.date || todayIso()), images });
        if (pdf.size <= maxBytes) break;
      }
      if (pdf.size > maxBytes) throw new Error("Mesmo comprimido, o PDF passou de 3 MB. Divida as fotos em dois PDFs.");
      setBusy("Salvando na aula…");
      const name = `${(title.trim() || "Slides da aula").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80)}.pdf`;
      const material = await create("materials", { title: title.trim() || "Slides da aula", type: "PDF", subjectId: subject?.id || lesson.subjectId, subject: subject?.name || "", lessonId: lesson.id, url: "", notes: `${photos.length} ${photos.length === 1 ? "foto" : "fotos"} de slides convertidas em PDF.` });
      try {
        const uploaded = await call("/files", { method: "POST", body: { materialId: material.id, name, mime: "application/pdf", data: await fileToBase64(pdf) } });
        replace("files", [uploaded, ...data.files]);
      } catch (failure) {
        throw new Error(`O material foi criado, mas o PDF não foi enviado: ${failure.message}`);
      }
      toast("PDF dos slides salvo na aula e na disciplina.");
      onClose();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  };

  return (
    <Modal title="Fotos dos slides em PDF" onClose={busy ? () => {} : onClose} wide>
      <div className="form slides-pdf">
        <p className="hint">Tire ou escolha as fotos dos slides, coloque na ordem e o Grimiau monta um PDF com capa, salvo nos materiais desta aula e da disciplina.</p>
        <label>
          Nome do PDF
          <input value={title} maxLength={160} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(event) => { addFiles(event.target.files || []); event.target.value = ""; }} />
        <button type="button" className="btn" disabled={Boolean(busy) || photos.length >= maxPhotos} onClick={() => input.current?.click()}>
          <FileImage size={16} /> {photos.length ? "Adicionar mais fotos" : "Escolher fotos dos slides"}
        </button>
        {photos.length > 0 && (
          <ol className="slides-grid" aria-label="Ordem das fotos no PDF">
            {photos.map((photo, index) => (
              <li key={photo.id}>
                <button type="button" className="slides-thumb" onClick={() => setPreview(photo)} aria-label={`Ver a foto ${index + 1} maior`}>
                  <img src={photo.url} alt="" loading="lazy" />
                  <span>{index + 1}</span>
                </button>
                <div className="slides-actions">
                  <button type="button" className="icon-btn" aria-label={`Mover a foto ${index + 1} para antes`} disabled={index === 0 || Boolean(busy)} onClick={() => move(index, -1)}>
                    <ArrowUp size={15} />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Mover a foto ${index + 1} para depois`} disabled={index === photos.length - 1 || Boolean(busy)} onClick={() => move(index, 1)}>
                    <ArrowDown size={15} />
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Tirar a foto ${index + 1}`} disabled={Boolean(busy)} onClick={() => setPhotos((current) => current.filter((item) => item.id !== photo.id))}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
        {preview && (
          <figure className="slides-preview">
            <img src={preview.url} alt={`Foto ${photos.indexOf(preview) + 1}`} />
            <button type="button" className="btn small ghost" onClick={() => setPreview(null)}>
              Fechar a foto
            </button>
          </figure>
        )}
        <FormError>{error}</FormError>
        <div className="form-actions">
          <button type="button" className="btn ghost" disabled={Boolean(busy)} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={Boolean(busy) || !photos.length} onClick={save}>
            {busy || `Gerar PDF com ${photos.length || ""} ${photos.length === 1 ? "foto" : "fotos"}`.replace("  ", " ")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
