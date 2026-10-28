import { entities, listEntity } from './entities.js';
import { computeProgress } from './progress.js';
import { publicName } from './social.js';
import { memory, pool } from './store.js';

// Ranking dos Bruxinhos: só entra quem ligou "Aparecer no ranking" (preferences.rankingPublic).
// O progresso é calculado na hora a partir dos registros, sem gravar nada. Sai apenas o nome público,
// a versão da foto, o nível, o XP, a sequência e o número de relíquias. Curso e faculdade servem só para
// o filtro "Minha turma" e nunca são enviados.

const maxListed = 200;
const normalize = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const parse = value => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
};
const todayInBrazil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

async function participants() {
  const rows = pool
    ? (await pool.query('SELECT id, name, avatar_version, course, institution, preferences FROM users')).rows
    : memory.users;
  return rows.filter(row => parse(row.preferences).rankingPublic === true).slice(0, maxListed);
}

async function progressFor(userId, today) {
  const [lessons, studySessions, flashcards, quizResults, exams, tasks] = await Promise.all(
    ['lessons', 'study-sessions', 'flashcards', 'quiz-results', 'exams', 'tasks'].map(key => listEntity(entities[key], userId))
  );
  return computeProgress({ lessons, studySessions, flashcards, quizResults, exams, tasks }, today);
}

export function registerRankingRoutes(app, requireAuth) {
  app.get('/api/v1/ranking', requireAuth, async (req, res, next) => {
    try {
      const scope = req.query.escopo === 'turma' ? 'turma' : 'geral';
      const me = req.user;
      const optedIn = parse(me.preferences).rankingPublic === true;
      const classKey = normalize(me.course) && normalize(me.institution) ? `${normalize(me.course)}|${normalize(me.institution)}` : '';
      if (scope === 'turma' && !classKey) return res.json({ scope, optedIn, needsClass: true, items: [] });
      const today = todayInBrazil();
      const people = (await participants()).filter(row => scope === 'geral' || `${normalize(row.course)}|${normalize(row.institution)}` === classKey);
      const items = [];
      for (const row of people) {
        const progress = await progressFor(row.id, today);
        items.push({
          id: row.id,
          name: publicName(row.name),
          avatarVersion: row.avatar_version || '',
          level: progress.level,
          title: progress.title,
          xp: progress.xp,
          streak: progress.streak,
          relics: progress.unlocked,
          me: row.id === me.id
        });
      }
      items.sort((a, b) => b.xp - a.xp || b.streak - a.streak || a.name.localeCompare(b.name, 'pt-BR'));
      return res.json({ scope, optedIn, needsClass: false, items: items.map((item, index) => ({ ...item, position: index + 1 })) });
    } catch (error) {
      return next(error);
    }
  });
}
