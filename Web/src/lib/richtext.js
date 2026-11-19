// Anotações da aula em texto formatado. Só passam as marcações do editor, sempre sem atributos:
// assim não sobra script, estilo, link nem evento, e o texto é exibido com segurança no navegador.
// Imagens do Caderno: só <img data-img="id">, refeita aqui a partir do id (o arquivo fica em notebook_images;
// o navegador busca com o token). Qualquer outro atributo, src incluído, é descartado.
// Carimbos do Caderno: só <span data-stamp="tipo"> com um dos tipos da lista; qualquer outro span perde a marcação.
// Este arquivo não importa nada: é o mesmo em Web/src/lib/richtext.js e Api/richtext.js (o teste confere que são iguais).

export const allowedTags = ["p", "br", "h2", "h3", "strong", "b", "em", "i", "u", "ul", "ol", "li", "blockquote", "div"];
const allowed = new Set(allowedTags);
export const stampKinds = ["importante", "cai", "revisar", "duvida", "dominei", "exemplo", "definicao"];
const escapeText = (text) => text.replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function sanitizeHtml(value, max = 60000) {
  if (typeof value !== "string") return "";
  const source = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|template|iframe|object|svg|math|noscript|textarea|title)\b[\s\S]*?<\/\1\s*>/gi, "")
    .slice(0, max * 2);
  let out = "";
  let last = 0;
  const spans = [];
  const tag = /<(\/?)([a-z][a-z0-9]*)\b[^<>]*>/gi;
  for (let match = tag.exec(source); match; match = tag.exec(source)) {
    out += escapeText(source.slice(last, match.index));
    const name = match[2].toLowerCase();
    const image = name === "img" && !match[1] ? /^<img(?:\s+[a-z-]+(?:="[^"]*"|='[^']*'|=[^\s>]*)?)*?\s+data-img="([0-9a-f-]{36})"/i.exec(match[0]) : null;
    const stamp = name === "span" && !match[1] ? /\sdata-stamp="([a-z]+)"/i.exec(match[0]) : null;
    if (image) out += `<img data-img="${image[1].toLowerCase()}">`;
    else if (name === "span") {
      // Fechamento só sai se a abertura correspondente era um carimbo válido.
      if (match[1]) {
        if (spans.pop()) out += "</span>";
      } else {
        const kind = stamp && stampKinds.includes(stamp[1].toLowerCase()) ? stamp[1].toLowerCase() : null;
        spans.push(Boolean(kind));
        if (kind) out += `<span data-stamp="${kind}">`;
      }
    } else if (allowed.has(name)) out += name === "br" ? "<br>" : `<${match[1]}${name}>`;
    last = tag.lastIndex;
  }
  out += escapeText(source.slice(last));
  out += spans.filter(Boolean).map(() => "</span>").join("");
  return out.length > max ? out.slice(0, max).replace(/<[^>]*$/, "") : out;
}

// Texto puro das anotações, para busca, XP e "aula com conteúdo".
export const htmlToText = (html) =>
  String(html || "")
    .replace(/<(br|\/p|\/div|\/li|\/h2|\/h3|\/blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
