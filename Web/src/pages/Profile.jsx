import { useMemo } from "react";
import { ChartLine, ChevronRight, Flame, Lock, Settings as SettingsIcon, Trophy } from "lucide-react";
import { useApp } from "../context.js";
import { todayIso } from "../lib/dates.js";
import { progressOf } from "../lib/domain.js";
import { formatDuration } from "../lib/ritual.js";
import { xpRules } from "../lib/progress.js";
import { Avatar } from "../ui.jsx";
import { MoonWeek, sparkle } from "../components/Art.jsx";

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
};

function Relic({ relic }) {
  return (
    <li className={`relic ${relic.unlocked ? "is-unlocked" : ""}`}>
      <span className="relic-medal" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="30" height="30">
          <path d={relicSymbols[relic.id]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          {relic.unlocked && <path d={sparkle(27, 6, 3)} fill="var(--gold)" stroke="none" />}
        </svg>
        {!relic.unlocked && <Lock size={11} className="relic-lock" />}
      </span>
      <strong>{relic.title}</strong>
      <small>{relic.unlocked ? "Conquistada" : relic.goal > 1 ? `${relic.value} de ${relic.goal}` : relic.description}</small>
    </li>
  );
}

export default function Profile() {
  const { data, user, go } = useApp();
  const today = todayIso();
  const progress = useMemo(() => progressOf(data, today), [data, today]);
  const span = progress.levelTo - progress.levelFrom;
  const inLevel = progress.xp - progress.levelFrom;
  const totalSeconds = data["study-sessions"].reduce((sum, session) => sum + session.durationSeconds, 0);
  const course = [user.course, user.semester && (/semestre/i.test(user.semester) ? user.semester : `${user.semester}º semestre`), user.institution].filter(Boolean).join(" · ");

  return (
    <div className="page profile">
      <header className="profile-head">
        <Avatar user={user} size={84} />
        <div>
          <h1>{user.name}</h1>
          <p className="profile-title">{progress.title}</p>
          {course && <small>{course}</small>}
        </div>
      </header>

      <section className="level-card" aria-label="Nível e experiência">
        <div className="level-top">
          <strong>Nível {progress.level}</strong>
          <span>
            {progress.xp.toLocaleString("pt-BR")} / {progress.levelTo.toLocaleString("pt-BR")} XP
          </span>
        </div>
        <div className="xp-track" role="progressbar" aria-label="Experiência até o próximo nível" aria-valuemin={0} aria-valuemax={span} aria-valuenow={inLevel}>
          <span style={{ width: `${(inLevel / span) * 100}%` }} />
        </div>
        <dl className="level-stats">
          <div>
            <dt>Sequência</dt>
            <dd>
              <Flame size={15} aria-hidden="true" /> {progress.streak} {progress.streak === 1 ? "dia" : "dias"}
            </dd>
          </div>
          <div>
            <dt>Relíquias</dt>
            <dd>
              {progress.unlocked} de {progress.achievements.length}
            </dd>
          </div>
          <div>
            <dt>Tempo de foco</dt>
            <dd>{totalSeconds ? formatDuration(totalSeconds) : "0 min"}</dd>
          </div>
          <div>
            <dt>Aulas registradas</dt>
            <dd>{progress.counts.lessons}</dd>
          </div>
        </dl>
        <MoonWeek days={progress.week} />
      </section>

      <section aria-labelledby="reliquias-title">
        <div className="section-head">
          <h2 className="section-title" id="reliquias-title">
            Relíquias
          </h2>
        </div>
        <ul className="relics">
          {progress.achievements.map((relic) => (
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
