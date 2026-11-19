import { useMemo } from "react";

// Janela do Grimório (página direita do Caderno), desenho da referência "Caderno de Aula" de 18/11/2026.
// A lua segue a fase real do dia. Chuva e pausa são escolhas do aparelho (guardadas pelo Caderno).
// As animações param com "Discretas" (data-motion) e com o movimento reduzido do sistema (caderno.css).

let seed = 7;
const rnd = () => {
  seed = (seed * 9301 + 49297) % 233280;
  return seed / 233280;
};
const f1 = (n) => n.toFixed(1);

function stars() {
  let o = "";
  for (let i = 0; i < 46; i++) {
    const r = 0.5 + rnd() * 1.1;
    o += `<circle class="st" cx="${f1(48 + rnd() * 204)}" cy="${f1(28 + rnd() * 190)}" r="${r.toFixed(2)}" style="--dl:-${(rnd() * 4).toFixed(2)}s;animation-duration:${(2 + rnd() * 3).toFixed(2)}s"/>`;
  }
  return o;
}
function flies() {
  let o = "";
  for (let i = 0; i < 9; i++) {
    const x = f1(62 + rnd() * 176);
    const y = f1(222 + rnd() * 70);
    o += `<g class="ff" style="--dx:${Math.round(rnd() * 50 - 25)}px;--dy:${-Math.round(10 + rnd() * 40)}px;--du:${(7 + rnd() * 6).toFixed(1)}s;--dl:-${(rnd() * 6).toFixed(1)}s"><circle class="fly" cx="${x}" cy="${y}" r="5" opacity=".22"/><circle class="fly" cx="${x}" cy="${y}" r="1.7"/></g>`;
  }
  return o;
}
function rain() {
  let o = "";
  for (let i = 0; i < 30; i++) {
    const x = 44 + rnd() * 212;
    o += `<line x1="${f1(x)}" y1="0" x2="${f1(x - 3)}" y2="14" style="--dl:-${(rnd() * 0.9).toFixed(2)}s"/>`;
  }
  return o;
}
function bulbs() {
  const cols = ["#ff8fc0", "#ffd36e", "#8ff0c8", "#b9a3ff"];
  let o = '<path d="M32 132A118 118 0 0 1 268 132" fill="none" stroke="rgba(255,255,255,.28)" stroke-width="1"/>';
  for (let i = 0; i <= 12; i++) {
    const t = (Math.PI * i) / 12;
    const x = f1(150 - 118 * Math.cos(t));
    const y = f1(132 - 118 * Math.sin(t));
    const c = cols[i % 4];
    o += `<g class="bulb" style="--dl:-${(i * 0.37).toFixed(2)}s"><circle cx="${x}" cy="${y}" r="7" fill="${c}" opacity=".25"/><circle cx="${x}" cy="${y}" r="3" fill="${c}"/></g>`;
  }
  return o;
}
function moonPath(p, r) {
  const k = Math.cos(2 * Math.PI * p);
  const rx = Math.abs(k) * r;
  const wax = p < 0.5;
  const s1 = wax ? 1 : 0;
  const s2 = wax ? (k > 0 ? 0 : 1) : k > 0 ? 1 : 0;
  return `M0 ${-r}A${r} ${r} 0 0 ${s1} 0 ${r}A${rx.toFixed(2)} ${r} 0 0 ${s2} 0 ${-r}Z`;
}

const phaseNames = ["Lua nova", "Lua crescente", "Quarto crescente", "Lua gibosa crescente", "Lua cheia", "Lua gibosa minguante", "Quarto minguante", "Lua minguante"];
export function moonInfo(date = new Date()) {
  const syn = 29.530588853;
  const days = (date.getTime() - Date.UTC(2000, 0, 6, 18, 14)) / 86400000;
  const p = (((days % syn) + syn) % syn) / syn;
  return { p, lit: (1 - Math.cos(2 * Math.PI * p)) / 2, name: phaseNames[Math.floor(p * 8 + 0.5) % 8] };
}

function scene(p) {
  seed = 7;
  return (
    '<svg viewBox="0 0 300 340" role="img" aria-label="Janela mística: um gato dorme sobre uma pilha de livros, com lua, estrelas e vaga-lumes lá fora">' +
    '<defs><linearGradient id="jg-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="s1"/><stop offset=".55" class="s2"/><stop offset="1" class="s3"/></linearGradient>' +
    '<radialGradient id="jg-moon"><stop offset="0" stop-color="#fff3c4" stop-opacity=".85"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="jg-sun"><stop offset="0" stop-color="#ffe6b0" stop-opacity=".95"/><stop offset="1" stop-color="#ffe6b0" stop-opacity="0"/></radialGradient>' +
    '<radialGradient id="jg-flame"><stop offset="0" stop-color="#ffc766" stop-opacity=".7"/><stop offset="1" stop-color="#ffc766" stop-opacity="0"/></radialGradient>' +
    '<clipPath id="jg-glass"><path d="M42 300V132A108 108 0 0 1 258 132V300Z"/></clipPath></defs>' +
    '<g clip-path="url(#jg-glass)"><rect x="40" y="20" width="220" height="285" fill="url(#jg-sky)"/>' +
    '<circle class="sun" cx="150" cy="300" r="150" fill="url(#jg-sun)"/>' +
    `<g class="stars">${stars()}</g>` +
    '<circle class="halo" cx="205" cy="86" r="38" fill="url(#jg-moon)"/>' +
    `<g transform="translate(205 86)"><circle class="moonbase" r="17"/><path d="${moonPath(p, 17)}" fill="#fff3c4"/></g>` +
    '<g class="cloud" style="--du:80s"><ellipse cx="86" cy="118" rx="30" ry="6"/><ellipse cx="106" cy="113" rx="20" ry="7"/></g>' +
    '<g class="cloud" style="--du:105s;--dl:-30s"><ellipse cx="170" cy="168" rx="34" ry="6"/><ellipse cx="190" cy="163" rx="18" ry="6"/></g>' +
    '<g class="shoot"><line x1="70" y1="48" x2="88" y2="58" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></g>' +
    '<path class="h1" d="M40 250Q80 228 120 242T200 236T260 244V305H40Z"/>' +
    '<rect class="h2" x="209" y="214" width="12" height="30"/><path class="h2" d="M206 214L215 190L224 214Z"/><rect class="lit" x="213" y="222" width="4" height="7" rx="1.5" style="--dl:-1s"/>' +
    '<path class="h2" d="M40 268Q90 248 140 262T260 258V305H40Z"/>' +
    '<path class="h3" d="M70 262l7-20 7 20zM84 264l6-16 6 16zM232 262l6-17 6 17z"/>' +
    '<rect class="h3" x="120" y="252" width="16" height="12"/><path class="h3" d="M118 252L128 243L138 252Z"/><rect class="lit" x="125" y="256" width="4" height="5" style="--dl:-2s"/>' +
    '<rect class="h3" x="150" y="256" width="13" height="10"/><path class="h3" d="M148 256L156.5 248L165 256Z"/><rect class="lit" x="154" y="259" width="3.5" height="4" style="--dl:-.3s"/>' +
    '<path class="h3" d="M40 288Q100 274 160 286T260 282V305H40Z"/>' +
    `${flies()}<g class="rainlayer">${rain()}</g><rect class="dim" x="40" y="20" width="220" height="285"/></g>` +
    '<path class="trim" d="M35 300V132A115 115 0 0 1 265 132V300"/><path class="frame" d="M42 300V132A108 108 0 0 1 258 132V300"/><path class="mull" d="M150 24V300M42 176H258"/>' +
    bulbs() +
    '<rect class="sillr" x="22" y="300" width="256" height="22" rx="6"/><rect x="22" y="300" width="256" height="4" rx="2" fill="#fff" opacity=".18"/><rect class="sillr" x="34" y="322" width="232" height="10" rx="4" opacity=".7"/>' +
    '<path d="M52 300l3-16h14l3 16z" fill="#d98a63"/>' +
    '<g class="leaf" style="--dl:-.5s"><path d="M62 284C52 270 54 258 60 252C66 262 66 274 62 284Z" fill="#5fcf9e"/></g>' +
    '<g class="leaf" style="--dl:-2s"><path d="M62 284C72 272 76 262 72 254C66 262 62 272 62 284Z" fill="#3fae85"/></g>' +
    '<g class="leaf" style="--dl:-3.2s"><path d="M62 284C58 268 62 252 62 244C66 254 66 270 62 284Z" fill="#7ae0b0"/></g>' +
    '<rect x="84" y="288" width="96" height="12" rx="2" fill="#8a56c8"/><rect x="170" y="288" width="10" height="12" rx="2" fill="#f1e8ff"/><rect x="100" y="288" width="3" height="12" fill="#f6c85f" opacity=".8"/>' +
    '<rect x="90" y="277" width="82" height="11" rx="2" fill="#3f9a9a"/><rect x="162" y="277" width="10" height="11" rx="2" fill="#f1e8ff"/><rect x="104" y="277" width="3" height="11" fill="#f6c85f" opacity=".8"/>' +
    '<rect x="86" y="267" width="82" height="10" rx="2" fill="#c4577f"/><rect x="158" y="267" width="10" height="10" rx="2" fill="#f1e8ff"/><rect x="100" y="267" width="3" height="10" fill="#f6c85f" opacity=".8"/>' +
    '<g class="cat"><ellipse class="catfill" cx="128" cy="252" rx="38" ry="16"/><ellipse class="cathi" cx="128" cy="246" rx="30" ry="7" opacity=".35"/>' +
    '<path class="tail" d="M162 258C182 262 176 278 150 276C138 275 124 272 114 268"/>' +
    '<path class="catfill" d="M84 247L86 231L97 242Z"/><path class="catfill" d="M97 242L107 232L109 248Z"/><circle class="catfill" cx="96" cy="255" r="14.5"/>' +
    '<path d="M87.5 256q3.2 3 6.4 0M99 256q3.2 3 6.4 0" fill="none" stroke="#f6e7ff" stroke-width="1.6" stroke-linecap="round"/><path d="M94.5 259.5h3l-1.5 2z" fill="#f08fb0"/>' +
    '<circle cx="96" cy="246.5" r="2.6" fill="#f6c85f"/><circle class="catfill" cx="97.2" cy="245.8" r="2.2"/><ellipse class="cathi" cx="109" cy="266" rx="7" ry="3.4"/></g>' +
    '<text class="zz" x="80" y="230" style="--dl:0s">z</text><text class="zz" x="88" y="222" style="--dl:1.7s;font-size:9px">z</text><text class="zz" x="74" y="220" style="--dl:3.4s;font-size:8px">z</text>' +
    '<circle class="flglow" cx="200" cy="270" r="24" fill="url(#jg-flame)"/><ellipse cx="200" cy="299" rx="10" ry="2.5" fill="#c9a24a"/>' +
    '<rect x="195" y="278" width="10" height="21" rx="2" fill="#f3ecff"/><path d="M195 282q2 6 4 0z" fill="#e1d6f7"/><rect x="199.4" y="273" width="1.2" height="5" fill="#5a4a7a"/>' +
    '<g class="flame"><path d="M200 262C205 268 205 274 200 276C195 274 195 268 200 262Z" fill="#ffb347"/><path d="M200 268C202.5 271 202.5 274 200 275C197.5 274 197.5 271 200 268Z" fill="#fff2b8"/></g>' +
    '<ellipse cx="234" cy="299" rx="13" ry="2.5" fill="#efe7ff"/><path d="M243 288c5 0 5 7 0 7" fill="none" stroke="#8a6bd6" stroke-width="1.6"/>' +
    '<path d="M225 286h18c0 9-3 13-9 13s-9-4-9-13z" fill="#f3ecff" stroke="#8a6bd6" stroke-width="1.6"/><ellipse cx="234" cy="286" rx="9" ry="2" fill="#c98b5a"/>' +
    '<path class="steam" d="M231 282q-3-5 0-9q3-4 0-8" style="--dl:0s"/><path class="steam" d="M237 282q3-5 0-9q-3-4 0-8" style="--dl:-1.7s"/>' +
    "</svg>"
  );
}

export default function Janela({ rainy, still }) {
  const info = moonInfo();
  const svg = useMemo(() => scene(info.p), [info.p.toFixed(3)]);
  return <div className={`janela${rainy ? " rainy" : ""}${still ? " still" : ""}`} dangerouslySetInnerHTML={{ __html: svg }} />;
}
