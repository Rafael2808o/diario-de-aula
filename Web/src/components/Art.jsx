import { useId } from "react";
import { Nox } from "../ui.jsx";

// Ilustrações da Grimiau, desenhadas à mão em SVG com as mesmas cores chapadas do Nox.
// Nada aqui é imagem gerada: cada pose reaproveita o desenho do Nox e acrescenta objetos simples.

// Brilho de quatro pontas, usado no lugar de estrelas genéricas.
export const sparkle = (cx, cy, r) =>
  `M${cx} ${cy - r}L${cx + r * 0.26} ${cy - r * 0.26}L${cx + r} ${cy}L${cx + r * 0.26} ${cy + r * 0.26}L${cx} ${cy + r}L${cx - r * 0.26} ${cy + r * 0.26}L${cx - r} ${cy}L${cx - r * 0.26} ${cy - r * 0.26}Z`;

// Lua crescente com o mesmo traço da marca na testa do Nox.
const crescent = (x, y, r) => `M${x} ${y - r}a${r} ${r} 0 1 0 0 ${r * 2} ${r * 0.8} ${r * 0.8} 0 1 1 0-${r * 2}z`;

function Books({ x = 0, y = 0, width = 180 }) {
  // Três livros empilhados, do maior para o menor, com as páginas aparecendo na lateral.
  const rows = [
    { inset: 0, h: 24, fill: "var(--book-1)" },
    { inset: 12, h: 22, fill: "var(--book-2)" },
    { inset: 22, h: 20, fill: "var(--book-3)" },
  ];
  let top = y;
  return (
    <g className="art-books">
      {rows.map((row, index) => {
        top -= row.h;
        const w = width - row.inset * 2 + (index === 1 ? 6 : 0);
        const left = x + row.inset - (index === 1 ? 4 : 0);
        return (
          <g key={index}>
            <rect x={left} y={top} width={w} height={row.h} rx="3" fill={row.fill} stroke="var(--nox-line)" strokeWidth="1.4" />
            <rect x={left + w - 14} y={top + 4} width="10" height={row.h - 8} rx="1.5" fill="var(--page)" />
            <path d={`M${left + w - 13} ${top + 8}h8M${left + w - 13} ${top + 12}h8M${left + w - 13} ${top + 16}h8`} stroke="var(--page-line)" strokeWidth="1" />
            <path d={`M${left + 12} ${top + 3}v${row.h - 6}M${left + 17} ${top + 3}v${row.h - 6}`} stroke="var(--gold)" strokeWidth="1.3" opacity="0.75" />
          </g>
        );
      })}
    </g>
  );
}

function Candle({ x, y, height = 40 }) {
  return (
    <g className="art-candle">
      <ellipse cx={x} cy={y} rx="14" ry="4" fill="var(--gold)" opacity="0.85" />
      <rect x={x - 7} y={y - height} width="14" height={height} rx="2" fill="var(--page)" />
      <path d={`M${x - 7} ${y - height + 6}c3 2 4 6 2 10`} stroke="var(--page-line)" strokeWidth="1.4" fill="none" />
      <path d={`M${x} ${y - height}v-4`} stroke="var(--nox-line)" strokeWidth="1.4" />
      <path className="art-flame" d={`M${x} ${y - height - 18}c5 6 6 10 0 14-6-4-5-8 0-14z`} fill="var(--gold)" />
    </g>
  );
}

function Stars({ items }) {
  return items.map(([cx, cy, r, twinkle], index) => (
    <path key={index} className={twinkle ? "art-twinkle" : ""} style={{ animationDelay: `${index * 0.7}s` }} d={sparkle(cx, cy, r)} fill={index % 3 === 1 ? "var(--text-2)" : "var(--gold)"} opacity={twinkle ? 1 : 0.7} />
  ));
}

// Capa: Nox sentado sobre uma pilha de livros, lua crescente atrás, vela acesa e um cristal.
export function CoverScene({ className = "" }) {
  const mask = useId();
  return (
    <svg className={`art cover-scene ${className}`} viewBox="0 0 360 300" role="img" aria-label="Nox, o gato preto da Grimiau, sentado sobre uma pilha de livros sob a lua crescente, ao lado de uma vela">
      <defs>
        <mask id={mask}>
          <rect width="360" height="300" fill="#fff" />
          <circle cx="134" cy="78" r="56" fill="#000" />
        </mask>
      </defs>
      <circle cx="112" cy="96" r="62" fill="var(--gold)" mask={`url(#${mask})`} />
      <Stars items={[[40, 40, 6, true], [262, 34, 5, false], [300, 92, 7, true], [58, 168, 4, false], [318, 160, 3.5, true], [214, 18, 3, false]]} />
      <ellipse cx="186" cy="266" rx="118" ry="9" fill="#000" opacity="0.28" />
      <Books x={96} y={264} width={180} />
      <g transform="translate(126 85)">
        <Nox size={120} alive label="" />
      </g>
      <Candle x={306} y={264} height={44} />
      <path d="M58 264l9-22 9 22-9 6z" fill="var(--text-2)" opacity="0.85" />
      <path d="M67 242v28M58 264h18" stroke="var(--bg)" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

// Nox dormindo, enrolado sobre os livros. Usado no Ritual de Foco e em telas de espera longas.
export function SleepingNox({ className = "", candle = true }) {
  return (
    <svg className={`art sleeping-nox ${className}`} viewBox="0 0 240 160" role="img" aria-label="Nox dormindo sobre uma pilha de livros">
      <ellipse cx="110" cy="150" rx="92" ry="6" fill="#000" opacity="0.25" />
      <Books x={30} y={150} width={160} />
      <path d="M58 86c-7 9-6 20 4 24" stroke="var(--nox-fur)" strokeWidth="9" strokeLinecap="round" fill="none" />
      <path className="nox-body" d="M60 86c0-26 22-40 52-40 32 0 52 16 52 40z" />
      <path d="M160 82c14 6 6 14-14 12" stroke="var(--nox-line)" strokeWidth="10.5" strokeLinecap="round" fill="none" />
      <path d="M160 82c14 6 6 14-14 12" stroke="var(--nox-fur)" strokeWidth="8" strokeLinecap="round" fill="none" />
      <g className="sleep-head">
        <path className="nox-body" d="M50 66l3-22 14 11M86 56l15-9-1 22" />
        <path d="M54 50l2-9 6 6zM95 52l5-3v7z" fill="var(--nox-ear)" />
        <ellipse className="nox-body" cx="74" cy="70" rx="26" ry="22" />
        <path d={crescent(76, 57, 4.2)} fill="var(--nox-moon)" />
        <path d="M60 71q5 4 10 0M78 71q5 4 10 0" fill="none" stroke="var(--nox-eye)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M72 79l2 1.6 2-1.6" fill="none" stroke="var(--nox-nose)" strokeWidth="1.8" strokeLinecap="round" />
      </g>
      <ellipse className="nox-body" cx="98" cy="86" rx="10" ry="4.5" />
      <g className="art-zzz" fill="var(--text-2)" fontFamily="var(--font-display)" fontWeight="600">
        <text x="104" y="40" fontSize="13">z</text>
        <text x="116" y="26" fontSize="17">z</text>
      </g>
      {candle && <Candle x={212} y={150} height={36} />}
      <Stars items={[[200, 30, 5, true], [22, 34, 4, false], [150, 14, 3, true]]} />
    </svg>
  );
}

// Poses do Nox com um objeto: lendo, segurando uma estrela, olhando uma carta, comemorando.
export function NoxPose({ pose = "reading", size = 96, className = "", label }) {
  const labels = {
    reading: "Nox lendo um livro aberto",
    star: "Nox segurando uma estrela",
    tarot: "Nox olhando uma carta de tarô",
    celebrate: "Nox comemorando",
    waiting: "Nox esperando com a cauda balançando",
  };
  const mood = { reading: "focused", star: "happy", tarot: "focused", celebrate: "happy", waiting: "calm" }[pose];
  return (
    <svg className={`art nox-pose pose-${pose} ${className}`} width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label || labels[pose]}>
      <Nox size={120} mood={mood} alive label="" />
      {pose === "reading" && (
        <g>
          <path d="M28 98c11-5 22-5 32 1 10-6 21-6 32-1v16c-11-5-22-5-32 1-10-6-21-6-32-1z" fill="var(--page)" stroke="var(--nox-line)" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M60 99v16M35 103c7-2 13-2 19 0M66 103c7-2 13-2 19 0M35 108c7-2 13-2 19 0" stroke="var(--page-line)" strokeWidth="1.2" fill="none" />
          <circle cx="30" cy="100" r="5" className="nox-body" />
          <circle cx="90" cy="100" r="5" className="nox-body" />
        </g>
      )}
      {pose === "star" && (
        <g>
          <path className="art-glow" d={sparkle(60, 100, 15)} fill="var(--gold)" />
          <circle cx="48" cy="96" r="5.5" className="nox-body" />
          <circle cx="72" cy="96" r="5.5" className="nox-body" />
        </g>
      )}
      {pose === "tarot" && (
        <g transform="rotate(10 88 96)">
          <rect x="72" y="72" width="30" height="44" rx="3" fill="var(--tarot)" stroke="var(--gold)" strokeWidth="1.4" />
          <rect x="76" y="76" width="22" height="36" rx="1.5" fill="none" stroke="var(--gold)" strokeWidth="0.8" opacity="0.6" />
          <path d={crescent(88, 94, 6)} fill="var(--gold)" />
          <circle cx="74" cy="100" r="5" className="nox-body" />
        </g>
      )}
      {pose === "celebrate" && (
        <g className="art-burst">
          <path d={sparkle(14, 40, 7)} fill="var(--gold)" />
          <path d={sparkle(106, 58, 6)} fill="var(--text-2)" />
          <path d={sparkle(20, 84, 4)} fill="var(--text-2)" />
          <path d={sparkle(102, 92, 5)} fill="var(--gold)" />
        </g>
      )}
    </svg>
  );
}

// Livro de uma disciplina: capa na cor da matéria (escurecida), moldura dourada e um emblema.
const emblems = ["moon", "star", "eye", "planet", "key"];
export function BookCover({ color = "#8d70b8", index = 0, width = 44, className = "" }) {
  const emblem = emblems[index % emblems.length];
  return (
    <svg className={`book-cover ${className}`} width={width} height={Math.round(width * 1.32)} viewBox="0 0 44 58" aria-hidden="true">
      <rect x="6" y="4" width="36" height="52" rx="2" fill="var(--page)" />
      <path d="M38 9v42M40 9v42" stroke="var(--page-line)" strokeWidth="0.8" />
      <rect x="2" y="2" width="35" height="54" rx="3" fill={color} />
      <rect x="2" y="2" width="35" height="54" rx="3" fill="#0d0814" opacity="0.42" />
      <rect x="2" y="2" width="6" height="54" rx="2" fill="#000" opacity="0.28" />
      <rect x="11" y="8" width="21" height="42" rx="2" fill="none" stroke="var(--gold)" strokeWidth="0.9" opacity="0.75" />
      <g fill="var(--gold)" stroke="var(--gold)">
        {emblem === "moon" && <path d={crescent(23, 29, 6.5)} stroke="none" />}
        {emblem === "star" && <path d={sparkle(21.5, 29, 7.5)} stroke="none" />}
        {emblem === "eye" && (
          <>
            <path d="M14 29q7.5-7 15 0-7.5 7-15 0z" fill="none" strokeWidth="1.2" />
            <circle cx="21.5" cy="29" r="2.4" stroke="none" />
          </>
        )}
        {emblem === "planet" && (
          <>
            <circle cx="21.5" cy="29" r="4.6" stroke="none" />
            <ellipse cx="21.5" cy="29" rx="9" ry="2.6" fill="none" strokeWidth="1" transform="rotate(-18 21.5 29)" />
          </>
        )}
        {emblem === "key" && (
          <>
            <circle cx="21.5" cy="23.5" r="3.4" fill="none" strokeWidth="1.3" />
            <path d="M21.5 27v10M21.5 33h3M21.5 36h2.4" fill="none" strokeWidth="1.3" />
          </>
        )}
      </g>
      <path d={sparkle(16, 14, 1.6)} fill="var(--gold)" opacity="0.8" />
      <path d={sparkle(28, 45, 1.4)} fill="var(--gold)" opacity="0.8" />
    </svg>
  );
}

// Verso da carta de tarô: moldura dupla, sol-lua no centro e estrelas nos cantos.
export function TarotBack({ className = "" }) {
  const rays = Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    const inner = index % 2 ? 50 : 48;
    const outer = index % 2 ? 58 : 66;
    return `M${100 + Math.cos(angle) * inner} ${150 + Math.sin(angle) * inner}L${100 + Math.cos(angle) * outer} ${150 + Math.sin(angle) * outer}`;
  }).join("");
  return (
    <svg className={`tarot-art ${className}`} viewBox="0 0 200 300" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x="9" y="9" width="182" height="282" rx="9" fill="none" stroke="var(--gold)" strokeWidth="1.6" />
      <rect x="17" y="17" width="166" height="266" rx="5" fill="none" stroke="var(--gold)" strokeWidth="0.8" opacity="0.55" />
      {[[30, 30], [170, 30], [30, 270], [170, 270]].map(([x, y]) => (
        <path key={`${x}${y}`} d={sparkle(x, y, 6)} fill="var(--gold)" />
      ))}
      <path d="M60 30h80M60 270h80" stroke="var(--gold)" strokeWidth="0.8" opacity="0.6" />
      <circle cx="100" cy="30" r="3" fill="var(--gold)" />
      <circle cx="100" cy="270" r="3" fill="var(--gold)" />
      <path d={rays} stroke="var(--gold)" strokeWidth="1.2" opacity="0.8" />
      <circle cx="100" cy="150" r="44" fill="none" stroke="var(--gold)" strokeWidth="1.4" />
      <circle cx="100" cy="150" r="38" fill="none" stroke="var(--gold)" strokeWidth="0.6" opacity="0.5" />
      <path d={crescent(106, 150, 24)} fill="var(--gold)" />
      {[[62, 92, 2.5], [140, 96, 3.5], [56, 214, 3], [146, 206, 2.5], [100, 82, 2], [100, 220, 2]].map(([x, y, r]) => (
        <path key={`${x}-${y}`} d={sparkle(x, y, r * 1.6)} fill="var(--text-2)" opacity="0.8" />
      ))}
    </svg>
  );
}

// Anel de progresso sólido, sem gradiente. O número vem sempre de dados reais.
export function ProgressRing({ value = 0, size = 92, stroke = 8, label, children }) {
  const radius = (size - stroke) / 2;
  const length = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="progress-ring" style={{ width: size, height: size }} role="img" aria-label={label || `${Math.round(clamped)}%`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--fill)" strokeWidth={stroke} />
        <circle
          className="progress-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={length}
          strokeDashoffset={length * (1 - clamped / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span>{children ?? `${Math.round(clamped)}%`}</span>
    </div>
  );
}

// Sete fases da lua para os últimos sete dias: lua cheia quando houve estudo no dia.
export function MoonWeek({ days }) {
  return (
    <ol className="moon-week" aria-label="Estudo nos últimos sete dias">
      {days.map((day) => (
        <li key={day.date} className={day.active ? "is-full" : ""} title={`${day.label}: ${day.active ? "estudou" : "sem estudo registrado"}`}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            {day.active ? <circle cx="11" cy="11" r="8" fill="var(--gold)" /> : <circle cx="11" cy="11" r="7.2" fill="none" stroke="var(--line-strong)" strokeWidth="1.4" />}
          </svg>
          <span>{day.short}</span>
          <span className="sr-only">{day.active ? "estudou" : "sem estudo"}</span>
        </li>
      ))}
    </ol>
  );
}
