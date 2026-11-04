// Monta um PDF a partir de fotos (JPEG), com capa do Grimiau, sem biblioteca externa.
// O PDF aceita JPEG direto (filtro DCTDecode), então cada foto entra como está, sem reprocessar.
// Textos usam as fontes padrão do PDF (Helvetica e Times) em WinAnsi, que cobrem os acentos do português.


// Texto para string literal do PDF em WinAnsi (Latin-1 cobre os acentos usados em português).
function pdfText(value) {
  let out = "";
  for (const char of String(value).normalize("NFC")) {
    const code = char.codePointAt(0);
    if (code === 0x2014 || code === 0x2013) out += "-";
    else if (code === 0x201c || code === 0x201d) out += '"';
    else if (code === 0x2018 || code === 0x2019) out += "'";
    else if (code === 0x2026) out += "...";
    else if (code < 32 || code > 255) continue;
    else if (char === "(" || char === ")" || char === "\\") out += `\\${char}`;
    else out += char;
  }
  return out;
}

function latin1(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) bytes[i] = text.charCodeAt(i) & 0xff;
  return bytes;
}

// Largura aproximada para centralizar e quebrar linhas (média das fontes padrão).
const approxWidth = (text, size, factor = 0.5) => text.length * size * factor;

function wrap(text, size, maxWidth, factor) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (approxWidth(next, size, factor) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

// Estrela de quatro pontas (o brilho do Grimiau) como caminho do PDF.
function sparkle(x, y, r) {
  const k = r * 0.22;
  return `${x} ${y + r} m ${x + k} ${y + k} l ${x + r} ${y} l ${x + k} ${y - k} l ${x} ${y - r} l ${x - k} ${y - k} l ${x - r} ${y} l ${x - k} ${y + k} l h f\n`;
}

function coverContent({ title, subject, date, pages }, width, height) {
  let c = "";
  // Fundo roxo noturno em faixas (degradê discreto, de cima para baixo).
  const top = [0.13, 0.09, 0.27];
  const bottom = [0.24, 0.16, 0.42];
  const bands = 24;
  for (let i = 0; i < bands; i += 1) {
    const t = i / (bands - 1);
    const color = top.map((v, j) => (v + (bottom[j] - v) * t).toFixed(3)).join(" ");
    c += `${color} rg 0 ${((height * i) / bands).toFixed(2)} ${width} ${(height / bands + 1).toFixed(2)} re f\n`;
  }
  // Moldura fina dourada.
  c += "0.86 0.74 0.47 RG 0.8 w 28 28 " + (width - 56) + " " + (height - 56) + " re S\n";
  c += "0.86 0.74 0.47 RG 0.4 w 34 34 " + (width - 68) + " " + (height - 68) + " re S\n";
  // Estrelas espalhadas (posições fixas para a capa ser sempre igual).
  const stars = [[0.12, 0.8, 7], [0.2, 0.68, 3], [0.82, 0.78, 9], [0.9, 0.62, 4], [0.74, 0.88, 3], [0.15, 0.22, 5], [0.86, 0.2, 6], [0.3, 0.86, 2.5], [0.62, 0.14, 3]];
  c += "0.95 0.86 0.6 rg\n";
  for (const [fx, fy, r] of stars) c += sparkle((width * fx).toFixed(1), (height * fy).toFixed(1), r);
  // Lua crescente: círculo dourado com um círculo da cor do fundo por cima.
  const mx = width / 2;
  const my = height * 0.7;
  const circle = (x, y, r) => {
    const k = r * 0.5523;
    return `${x + r} ${y} m ${x + r} ${y + k} ${x + k} ${y + r} ${x} ${y + r} c ${x - k} ${y + r} ${x - r} ${y + k} ${x - r} ${y} c ${x - r} ${y - k} ${x - k} ${y - r} ${x} ${y - r} c ${x + k} ${y - r} ${x + r} ${y - k} ${x + r} ${y} c f\n`;
  };
  c += "0.95 0.86 0.6 rg " + circle(mx, my, 22);
  c += "0.165 0.115 0.315 rg " + circle(mx + 9, my + 6, 19);

  const text = (value, font, size, y, color) => {
    const x = Math.max(40, (width - approxWidth(value, size, font === "F2" ? 0.46 : 0.52)) / 2);
    return `BT ${color} rg /${font} ${size} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${pdfText(value)}) Tj ET\n`;
  };
  c += text("GRIMIAU", "F1", 12, height * 0.55, "0.86 0.74 0.47");
  const titleLines = wrap(title, 30, width - 140, 0.46);
  titleLines.forEach((line, index) => {
    c += text(line, "F2", 30, height * 0.46 - index * 36, "0.98 0.96 1");
  });
  const after = height * 0.46 - titleLines.length * 36 - 6;
  if (subject) c += text(subject, "F1", 14, after, "0.8 0.76 0.95");
  c += text(`${date}  -  ${pages} ${pages === 1 ? "foto" : "fotos"} de slides`, "F1", 10, after - 24, "0.7 0.66 0.85");
  c += text("Guardado no seu grimório acadêmico", "F3", 10, 48, "0.7 0.66 0.85");
  return c;
}

// images: [{ bytes: Uint8Array (JPEG), width, height }]
export function buildSlidesPdf({ title, subject, date, images }) {
  const objects = [];
  const add = (parts) => {
    objects.push(parts);
    return objects.length;
  };
  const catalog = add(null);
  const pagesId = add(null);
  const fonts = {
    F1: add(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]),
    F2: add(["<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>"]),
    F3: add(["<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"]),
  };
  const fontRes = `/Font << ${Object.entries(fonts).map(([name, id]) => `/${name} ${id} 0 R`).join(" ")} >>`;
  const pageIds = [];
  const stream = (dict, body) => {
    const bytes = typeof body === "string" ? latin1(body) : body;
    return [`<< ${dict} /Length ${bytes.length} >>\nstream\n`, bytes, "\nendstream"];
  };

  // Capa em A4 deitado.
  const coverW = 842;
  const coverH = 595;
  const cover = add(stream("", coverContent({ title, subject, date, pages: images.length }, coverW, coverH)));
  pageIds.push(add([`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${coverW} ${coverH}] /Resources << ${fontRes} >> /Contents ${cover} 0 R >>`]));

  images.forEach((image, index) => {
    // Cada página tem a proporção da foto: largura fixa de 842 pt, sem distorcer nem cortar.
    const pageW = 842;
    const pageH = Math.round((pageW * image.height) / image.width);
    const imageId = add(stream(`/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, image.bytes));
    const footer = `BT 0.55 0.5 0.7 rg /F1 8 Tf 24 10 Td (${pdfText(`${index + 1} / ${images.length}`)}) Tj ET\n`;
    const content = add(stream("", `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q\n` + `q 1 1 1 rg 18 4 40 14 re f Q\n` + footer));
    pageIds.push(add([`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << ${fontRes} /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${content} 0 R >>`]));
  });

  objects[catalog - 1] = [`<< /Type /Catalog /Pages ${pagesId} 0 R >>`];
  objects[pagesId - 1] = [`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`];
  const info = add([`<< /Title (${pdfText(title)}) /Producer (Grimiau) >>`]);

  const chunks = [latin1("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((parts, index) => {
    offsets.push(offset);
    const pieces = [`${index + 1} 0 obj\n`, ...parts, "\nendobj\n"].map((part) => (typeof part === "string" ? latin1(part) : part));
    for (const piece of pieces) {
      chunks.push(piece);
      offset += piece.length;
    }
  });
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((value) => `${String(value).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  chunks.push(latin1(xref));
  return new Blob(chunks, { type: "application/pdf" });
}

// Reduz a foto no aparelho (lado maior até `max` px) e devolve JPEG com as dimensões finais.
export async function photoToJpeg(file, max = 1600, quality = 0.78) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const source = bitmap || (await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Não consegui abrir a foto ${file.name}.`));
    img.src = URL.createObjectURL(file);
  }));
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

