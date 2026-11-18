import { apiBase } from "./api.js";

// Reduz a foto no próprio aparelho (respeitando a orientação da câmera) e devolve um JPEG leve.
// Usado no Feed dos Migles e nas fotos do Caderno da aula.
export async function preparePhoto(file, { maxSide = 1600, maxBytes = 650 * 1024 } = {}) {
  if (!file?.type?.startsWith("image/")) throw new Error("Escolha uma imagem (JPG, PNG, WEBP ou foto da câmera).");
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

export const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(blob);
  });

// Fotos do Caderno: o HTML guarda só <img data-img="id">; aqui o navegador busca cada uma com o token
// e mostra pelo endereço local (blob:). O endereço nunca volta para o texto salvo (o sanitizador tira o src).
const cache = new Map();
export function notebookImageUrl(id, token) {
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(`${apiBase}/imagens-caderno/${id}`, { headers: { Authorization: `Bearer ${token}` } })
        .then((response) => (response.ok ? response.blob() : Promise.reject(new Error("imagem"))))
        .then((blob) => URL.createObjectURL(blob))
        .catch((error) => {
          cache.delete(id);
          throw error;
        }),
    );
  }
  return cache.get(id);
}

export function hydrateImages(root, token) {
  if (!root) return;
  for (const image of root.querySelectorAll("img[data-img]")) {
    if (image.getAttribute("src")) continue;
    image.alt = "Foto do caderno";
    image.loading = "lazy";
    image.classList.add("is-loading");
    notebookImageUrl(image.dataset.img, token)
      .then((url) => {
        image.src = url;
        image.classList.remove("is-loading");
      })
      .catch(() => {
        image.classList.remove("is-loading");
        image.classList.add("is-missing");
        image.alt = "Foto indisponível";
      });
  }
}
