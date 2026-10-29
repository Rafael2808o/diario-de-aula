import { randomUUID } from 'node:crypto';
import { entities, listEntity } from './entities.js';
import { listMoods, listOwnSongs, todayInBrazil } from './lunar.js';
import { computeProgress } from './progress.js';
import { initStore, memory, pool } from './store.js';

// Avisos do sino no cabeçalho. Cada aviso nasce de um acontecimento real e tem uma chave única por conta
// (dedupe_key): repetir o mesmo acontecimento, recarregar a página ou reenviar um pedido não cria outro aviso.
// Relíquias e níveis são conferidos quando a pessoa abre os avisos; na primeira conferência, o que já estava
// conquistado vira o ponto de partida, sem avisos, para quem já usava a Grimiau não receber uma enxurrada.

let ready;
function initNotifications() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', link TEXT NOT NULL DEFAULT '{}',
        dedupe_key TEXT NOT NULL, read_at TIMESTAMPTZ, archived BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_idx ON notifications(user_id, dedupe_key);
      CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS progress_state (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        relics TEXT NOT NULL DEFAULT '{}', level INTEGER NOT NULL DEFAULT 1, updated_at TIMESTAMPTZ DEFAULT NOW())`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const memoryNotifications = () => (memory.notifications ||= []);
const memoryStates = () => (memory.progressStates ||= new Map());
const parse = (value, fallback) => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
};

// link = { page, params } dentro do app.
export async function notify(userId, { kind, key, title, body = '', link = {} }) {
  await initNotifications();
  const row = { id: randomUUID(), userId, kind, title: String(title).slice(0, 160), body: String(body).slice(0, 400), link, key: String(key).slice(0, 200) };
  if (pool) {
    await pool.query(`INSERT INTO notifications (id,user_id,kind,title,body,link,dedupe_key) VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (user_id, dedupe_key) DO NOTHING`, [row.id, userId, kind, row.title, row.body, JSON.stringify(link), row.key]);
    return;
  }
  if (memoryNotifications().some(item => item.userId === userId && item.key === row.key)) return;
  memoryNotifications().push({ ...row, createdAt: Date.now(), readAt: null, archived: false });
}

// Mesmos registros usados no perfil, para o XP e as relíquias baterem em todo lugar (ranking, avisos, perfil).
export async function progressFor(userId, today = todayInBrazil()) {
  const [lessons, studySessions, flashcards, quizResults, exams, tasks, moods, songs] = await Promise.all([
    ...['lessons', 'study-sessions', 'flashcards', 'quiz-results', 'exams', 'tasks'].map(key => listEntity(entities[key], userId)),
    listMoods(userId),
    listOwnSongs(userId)
  ]);
  return computeProgress({ lessons, studySessions, flashcards, quizResults, exams, tasks, moods, songs }, today);
}

async function readState(userId) {
  if (pool) {
    const row = (await pool.query('SELECT relics, level FROM progress_state WHERE user_id=$1', [userId])).rows[0];
    return row ? { relics: parse(row.relics, {}), level: row.level } : null;
  }
  return memoryStates().get(userId) || null;
}

async function writeState(userId, state, { insert = false } = {}) {
  if (pool) {
    if (insert) {
      await pool.query('INSERT INTO progress_state (user_id,relics,level) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING', [userId, JSON.stringify(state.relics), state.level]);
    } else {
      await pool.query('UPDATE progress_state SET relics=$2, level=$3, updated_at=NOW() WHERE user_id=$1', [userId, JSON.stringify(state.relics), state.level]);
    }
    return;
  }
  if (insert && memoryStates().has(userId)) return;
  memoryStates().set(userId, state);
}

// Confere relíquias e nível. Devolve as datas de conquista guardadas (id -> AAAA-MM-DD, ou "" quando a relíquia
// já estava conquistada antes desta versão e os registros não dizem o dia).
export async function syncProgress(userId) {
  await initNotifications();
  const today = todayInBrazil();
  const progress = await progressFor(userId, today);
  const unlocked = progress.achievements.filter(item => item.unlocked);
  const state = await readState(userId);
  if (!state) {
    const baseline = { relics: Object.fromEntries(unlocked.map(item => [item.id, item.unlockedOn || ''])), level: progress.level };
    await writeState(userId, baseline, { insert: true });
    return { relics: (await readState(userId))?.relics || baseline.relics, progress };
  }
  // Relíquia conquistada não é retirada, mesmo que um registro seja apagado depois.
  const fresh = unlocked.filter(item => !(item.id in state.relics));
  const next = { relics: { ...state.relics }, level: Math.max(state.level, progress.level) };
  for (const item of fresh) {
    next.relics[item.id] = today;
    await notify(userId, { kind: 'reliquia', key: `reliquia:${item.id}`, title: `Nova relíquia: ${item.title}`, body: item.description, link: { page: 'perfil', params: { secao: 'reliquias' } } });
  }
  if (progress.level > state.level) {
    await notify(userId, { kind: 'nivel', key: `nivel:${progress.level}`, title: `Você chegou ao nível ${progress.level}`, body: `${progress.title}. Total de ${progress.xp} XP.`, link: { page: 'historico-xp' } });
  }
  if (fresh.length || progress.level > state.level) await writeState(userId, next);
  return { relics: next.relics, progress };
}

const publicNotification = row => ({
  id: row.id, kind: row.kind, title: row.title, body: row.body, link: parse(row.link, {}),
  createdAt: new Date(row.createdAt).toISOString(), read: Boolean(row.readAt)
});

async function listNotifications(userId) {
  if (pool) {
    return (await pool.query(`SELECT id, kind, title, body, link, created_at AS "createdAt", read_at AS "readAt" FROM notifications
      WHERE user_id=$1 AND NOT archived ORDER BY created_at DESC LIMIT 60`, [userId])).rows.map(publicNotification);
  }
  return memoryNotifications()
    .filter(item => item.userId === userId && !item.archived)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 60)
    .map(publicNotification);
}

const ids = value => (Array.isArray(value) ? value.filter(id => typeof id === 'string').slice(0, 100) : null);

export function registerNotificationRoutes(app, requireAuth) {
  app.get('/api/v1/notifications', requireAuth, async (req, res, next) => {
    try {
      await syncProgress(req.user.id);
      const items = await listNotifications(req.user.id);
      return res.json({ items, unread: items.filter(item => !item.read).length });
    } catch (error) {
      return next(error);
    }
  });

  // Corpo { ids: [...] } marca esses; sem ids, marca todos como lidos.
  app.post('/api/v1/notifications/read', requireAuth, async (req, res, next) => {
    try {
      await initNotifications();
      const chosen = ids(req.body?.ids);
      if (pool) {
        if (chosen) await pool.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND id = ANY($2) AND read_at IS NULL', [req.user.id, chosen]);
        else await pool.query('UPDATE notifications SET read_at=NOW() WHERE user_id=$1 AND read_at IS NULL', [req.user.id]);
      } else {
        for (const item of memoryNotifications()) if (item.userId === req.user.id && (!chosen || chosen.includes(item.id)) && !item.readAt) item.readAt = Date.now();
      }
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  // Arquivar tira o aviso da lista sem apagar o registro; sem ids, arquiva os já lidos.
  app.post('/api/v1/notifications/archive', requireAuth, async (req, res, next) => {
    try {
      await initNotifications();
      const chosen = ids(req.body?.ids);
      if (pool) {
        if (chosen) await pool.query('UPDATE notifications SET archived=TRUE, read_at=COALESCE(read_at, NOW()) WHERE user_id=$1 AND id = ANY($2)', [req.user.id, chosen]);
        else await pool.query('UPDATE notifications SET archived=TRUE WHERE user_id=$1 AND read_at IS NOT NULL', [req.user.id]);
      } else {
        for (const item of memoryNotifications()) {
          if (item.userId !== req.user.id) continue;
          if (chosen ? chosen.includes(item.id) : item.readAt) Object.assign(item, { archived: true, readAt: item.readAt || Date.now() });
        }
      }
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  // Datas de conquista guardadas e histórico de XP calculado no servidor (o mesmo do site).
  app.get('/api/v1/progress', requireAuth, async (req, res, next) => {
    try {
      const { relics, progress } = await syncProgress(req.user.id);
      return res.json({ relics, xp: progress.xp, level: progress.level });
    } catch (error) {
      return next(error);
    }
  });
}
