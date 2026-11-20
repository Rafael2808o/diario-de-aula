import { useEffect, useMemo, useRef, useState } from "react";
import { ChartLine, ChevronRight, Flame, Lock, Moon as MoonIcon, ScrollText, Settings as SettingsIcon, Star, Trophy } from "lucide-react";
import { useApp } from "../context.js";
import { formatFull, todayIso } from "../lib/dates.js";
import { progressOf } from "../lib/domain.js";
import { formatDuration } from "../lib/ritual.js";
import { titles, xpRules } from "../lib/progress.js";
import { Avatar } from "../ui.jsx";
import { sparkle } from "../components/Art.jsx";
import { PublicProfile, ShowcaseCard, ShowcaseEditor } from "../components/Showcase.jsx";

// Medalha de cada relíquia: um símbolo próprio, dourado quando conquistada.
const relicSymbols = {
  "primeira-aula": "M9 6h11a2 2 0 0 1 2 2v15H11a2 2 0 0 1-2-2zM9 6v15M13 11h6M13 15h6",
  "primeira-prova": "M16 5l9 5-9 5-9-5zM10 12v5c3 3 9 3 12 0v-5",
  "primeiro-ritual": "M12 6h8M12 26h8M13 6c0 6 6 7 6 10s-6 4-6 10M19 6c0 6-6 7-6 10s6 4 6 10",
  "sete-dias": "M20 7a9 9 0 1 0 0 18 7 7 0 1 1 0-18z",
  grimorio: "M7 9c4-2 6-2 9 0 3-2 5-2 9 0v15c-4-2-6-2-9 0-3-2-5-2-9 0zM16 9v15",
  "cem-questoes": "M16 4a12 12 0 1 0 0.01 0zM13 13a3 3 0 1 1 4 3c-1 .5-1 1.5-1 2.5M16 22v.5",
  cartas: "M8 8h11v16H8zM12 6l11 2-2 16",
  noturno: "M21 6a10 10 0 1 0 5 13A8 8 0 0 1 21 6z",
  "dez-horas": "M16 6a10 10 0 1 0 .01 0zM16 10v6l4 3",
  "primeira-estrela": "M16 5l3 7 7 .6-5.4 4.6 1.7 7-6.3-3.8-6.3 3.8 1.7-7L6 12.6l7-.6z",
  "diario-aberto": "M6 8c4-1.5 7-1.5 10 1v15c-3-2.5-6-2.5-10-1zM16 9c3-2.5 6-2.5 10-1v15c-4-1-7-1-10 1M9 13h4M9 17h4",
  "comeco-magico": "M16 26V14M16 14c0-4 3-7 7-7 0 4-3 7-7 7zM16 18c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z",
  lunar: "M20 6a10 10 0 1 0 6 13 8 8 0 0 1-6-13zM8 8l1 2M6 14h2",
  musical: "M12 23V9l12-3v14M12 23a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM24 20a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
};

function Relic({ relic }) {
  return (
    <li className={`relic ${relic.unlocked ? "is-unlocked" : ""}`} title={relic.description}>
      <span className="relic-medal" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="30" height="30">
          <path d={relicSymbols[relic.id]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {relic.unlocked && <path d={sparkle(27, 6, 3)} fill="var(--gold)" stroke="none" />}
        </svg>
        {!relic.unlocked && <Lock size={11} className="relic-lock" />}
      </span>
      <strong>{relic.title}</strong>
      <small>
        {relic.unlocked ? (relic.unlockedOn ? `Conquistada em ${formatFull(relic.unlockedOn)}` : "Conquistada") : relic.goal > 1 ? `${relic.value} de ${relic.goal}` : relic.description}
      </small>
    </li>
  );
}

export default function Profile() {
  const { params, user } = useApp();
  if (params.pessoa && params.pessoa !== user.id) return <PublicProfile userId={params.pessoa} />;
  return <MyProfile />;
}

function MyProfile() {
  const { data, user, go, call, params } = useApp();
  const [showcase, setShowcase] = useState(null);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    call("/vitrine").then(setShowcase).catch(() => {});
  }, [call]);
  const today = todayIso();
  const progress = useMemo(() => progressOf(data, today), [data, today]);
  // Datas guardadas no servidor quando a relíquia foi percebida (para as que os registros não datam).
  // Relíquia já conquistada continua conquistada, mesmo que um registro tenha sido apagado depois.
  const [saved, setSaved] = useState({});
  useEffect(() => {
    call("/progress").then((result) => setSaved(result.relics || {})).catch(() => {});
  }, [call, data]);
  const relics = progress.achievements.map((relic) =>
    relic.unlocked || relic.id in saved ? { ...relic, unlocked: true, unlockedOn: relic.unlockedOn || saved[relic.id] || "" } : relic,
  );
  const relicsRef = useRef(null);
  useEffect(() => {
    if (params.secao === "reliquias") relicsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [params.secao]);
  const span = progress.levelTo - progress.levelFrom;
  const inLevel = progress.xp - progress.levelFrom;
  const totalSeconds = data["study-sessions"].reduce((sum, session) => sum + session.durationSeconds, 0);
  const percent = span > 0 ? Math.max(0, Math.min(100, Math.round((inLevel / span) * 100))) : 0;
  const nextTitle = titles.find(([from]) => from > progress.level);
  const weekFocus = progress.week.map((day) => ({ ...day, seconds: data["study-sessions"].filter((session) => session.date === day.date).reduce((sum, session) => sum + session.durationSeconds, 0) }));
  const weekSeconds = weekFocus.reduce((sum, day) => sum + day.seconds, 0);
  const weekMax = Math.max(1, ...weekFocus.map((day) => day.seconds));
  const course = [user.course, user.semester && (/semestre/i.test(user.semester) ? user.semester : `${user.semester}º semestre`), user.institution].filter(Boolean).join(" · ");

  return (
    <div className="page profile">
      {showcase ? (
        <ShowcaseCard person={{ ...user, me: true, course }} showcase={showcase} title={progress.title} onEdit={() => setEditing(true)} onVibe={(vibe) => setShowcase({ ...showcase, vibe })} />
      ) : (
        <header className="profile-head">
          <Avatar user={user} size={84} />
          <div>
            <h1>{user.name}</h1>
            {course && <small>{course}</small>}
          </div>
        </header>
      )}
      {!showcase && <p className="profile-title">{progress.title}</p>}
      {editing && showcase && (
        <ShowcaseEditor
          showcase={showcase}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setShowcase({ ...showcase, ...next });
            setEditing(false);
          }}
        />
      )}

      <div className="profile-stats">
        <section className="level-card mystic" aria-label="Nível e título">
          <div className="mystic-top">
            <div className="mystic-ring" role="progressbar" aria-label="Experiência até o próximo nível" aria-valuemin={0} aria-valuemax={span} aria-valuenow={inLevel}>
              <svg viewBox="0 0 118 118" aria-hidden="true">
                <circle cx="59" cy="59" r="46" className="track" />
                <circle cx="59" cy="59" r="46" className="fill" style={{ strokeDashoffset: (289 - (289 * percent) / 100).toFixed(1) }} />
              </svg>
              <div>
                <b>{percent}%</b>
                <span>Nível {progress.level}</span>
              </div>
            </div>
            <div className="mystic-text">
              <small>Título místico</small>
              <h2>{progress.title}</h2>
              <p>
                {(progress.levelTo - progress.xp).toLocaleString("pt-BR")} XP para o nível {progress.level + 1}
                {nextTitle ? ` · ${nextTitle[1]} no nível ${nextTitle[0]}` : ""}
              </p>
              <div className="mystic-ladder" aria-label={`Títulos: ${titles.filter(([from]) => progress.level >= from).length} de ${titles.length}`}>
                {titles.map(([from, name]) => (
                  <i key={name} className={progress.level >= from ? "on" : ""} title={`${name} (nível ${from})`}>
                    <Star size={16} aria-hidden="true" />
                  </i>
                ))}
              </div>
            </div>
          </div>
          <dl className="mystic-stats">
            <div>
              <dd>{progress.xp.toLocaleString("pt-BR")}</dd>
              <dt>XP</dt>
            </div>
            <div>
              <dd>
                <Flame size={15} aria-hidden="true" /> {progress.streak}
              </dd>
              <dt>{progress.streak === 1 ? "dia seguido" : "dias seguidos"}</dt>
            </div>
            <div>
              <dd>
                {relics.filter((relic) => relic.unlocked).length}/{relics.length}
              </dd>
              <dt>relíquias</dt>
            </div>
            <div>
              <dd>{progress.counts.lessons}</dd>
              <dt>aulas</dt>
            </div>
          </dl>
          <button type="button" className="link-btn level-history" onClick={() => go("historico-xp")}>
            <ScrollText size={14} /> Ver de onde veio cada XP
          </button>
        </section>
        <section className="level-card focus-time" aria-label="Tempo de foco acumulado">
          <svg className="hourglass" viewBox="0 0 66 92" aria-hidden="true">
            <path d="M8 4h50M8 88h50" stroke="#e3bf62" strokeWidth="5" strokeLinecap="round" />
            <path d="M12 8h42c0 22-14 28-14 38s14 16 14 38H12c0-22 14-28 14-38S12 30 12 8z" fill="rgba(160,130,230,.12)" stroke="#cbb8ff" strokeWidth="2.5" strokeLinejoin="round" />
            <path className="sand1" d="M17 12h32c-2 10-10 14-14 22h-4c-4-8-12-12-14-22z" fill="#f0c36d" />
            <rect className="drop" x="32" y="40" width="2" height="38" fill="#f0c36d" />
            <path className="sand2" d="M18 84c0-10 7-16 15-16s15 6 15 16z" fill="#f0c36d" />
          </svg>
          <div className="focus-time-text">
            <small>Tempo de foco acumulado</small>
            <strong>{totalSeconds ? formatDuration(totalSeconds) : "0 min"}</strong>
            <p>Nesta semana: {weekSeconds ? formatDuration(weekSeconds) : "nada ainda"}</p>
          </div>
          <ol className="focus-week" aria-label="Minutos de foco nos últimos sete dias">
            {weekFocus.map((day) => (
              <li key={day.date} title={`${day.label}: ${Math.round(day.seconds / 60)} min`}>
                <i style={{ height: `${Math.max(4, Math.round((day.seconds / weekMax) * 52))}px` }} className={day.seconds ? "on" : ""} />
                <span aria-hidden="true">{day.short}</span>
                <span className="sr-only">
                  {day.label}: {Math.round(day.seconds / 60)} minutos
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="reliquias-title" ref={relicsRef}>
        <div className="section-head">
          <h2 className="section-title" id="reliquias-title">
            Relíquias
          </h2>
        </div>
        <ul className="relics">
          {relics.map((relic) => (
            <Relic key={relic.id} relic={relic} />
          ))}
        </ul>
      </section>

      <ul className="group profile-links">
        <li>
          <button type="button" className="row" onClick={() => go("ranking")}>
            <Trophy size={18} className="row-icon" aria-hidden="true" />
            <span className="row-main">
              <strong>Ranking dos Bruxinhos</strong>
              <small>Só aparece quem escolhe participar.</small>
            </span>
            <ChevronRight size={16} className="chevron" aria-hidden="true" />
          </button>
        </li>
        <li>
          <button type="button" className="row" onClick={() => go("historico-xp")}>
            <ScrollText size={18} className="row-icon" aria-hidden="true" />
            <span className="row-main">
              <strong>Histórico de XP</strong>
              <small>Quanto ganhou, quando e por quê.</small>
            </span>
            <ChevronRight size={16} className="chevron" aria-hidden="true" />
          </button>
        </li>
        <li>
          <button type="button" className="row" onClick={() => go("lua")}>
            <MoonIcon size={18} className="row-icon" aria-hidden="true" />
            <span className="row-main">
              <strong>Fases da Lua</strong>
              <small>Seu mood de estudante, a Constelação e a Rádio.</small>
            </span>
            <ChevronRight size={16} className="chevron" aria-hidden="true" />
          </button>
        </li>
        <li>
          <button type="button" className="row" onClick={() => go("historico")}>
            <ChartLine size={18} className="row-icon" aria-hidden="true" />
            <span className="row-main">
              <strong>Histórico de estudos</strong>
              <small>Sessões, simulados e evolução por semana.</small>
            </span>
            <ChevronRight size={16} className="chevron" aria-hidden="true" />
          </button>
        </li>
        <li>
          <button type="button" className="row" onClick={() => go("configuracoes")}>
            <SettingsIcon size={18} className="row-icon" aria-hidden="true" />
            <span className="row-main">
              <strong>Configurações</strong>
              <small>Conta, aparência, notificações e privacidade.</small>
            </span>
            <ChevronRight size={16} className="chevron" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <p className="footnote">
        O XP vem dos seus registros: {xpRules.lesson} por aula registrada, {xpRules.minute} por minuto salvo no Ritual, {xpRules.review} por carta revisada, {xpRules.correct} por questão certa,{" "}
        {xpRules.reviewed} por assunto revisado e {xpRules.task} por atividade concluída. A sequência conta dias seguidos com estudo registrado.
      </p>
    </div>
  );
}
