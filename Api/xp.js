import { randomUUID } from 'node:crypto';
import { initStore, memory, pool } from './store.js';
import { publicName } from './social.js';

// XP da comunidade (V3.0): cada recompensa ou penalidade é um registro único por pessoa + tipo + referência.
// O XP antigo continua calculado a partir dos registros acadêmicos; este livro só soma o que é novo.
// Apagar uma reação, um resumo ou uma foto não devolve nem repete o XP: a linha fica no histórico.
export const xpValues = {
  'resumo-compartilhado': 50,
  'resumo-reacao': 20,
  'resumo-salvo': 40,
  'feed-diario': 200,
  'tarefa-atrasada': -300,
};
export const xpTexts = {
  'resumo-compartilhado': 'compartilhou um resumo',
  'resumo-reacao': 'reagiu a um resumo',
  'resumo-salvo': 'salvou um resumo no grimório',
  'feed-diario': 'publicou a foto do dia no Feed dos Migles',
};

let ready;
export function initXp() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS xp_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, ref TEXT NOT NULL, xp INTEGER NOT NULL, text TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE (user_id, kind, ref));
      CREATE INDEX IF NOT EXISTS xp_events_user_idx ON xp_events(user_id);
      CREATE TABLE IF NOT EXISTS community_activity (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL, text TEXT NOT NULL, xp INTEGER NOT NULL DEFAULT 0, dedupe TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE (user_id, dedupe));
      CREATE INDEX IF NOT EXISTS community_activity_created_idx ON community_activity(created_at DESC);
      CREATE TABLE IF NOT EXISTS activity_reactions (
        activity_id TEXT NOT NULL REFERENCES community_activity(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, emoji TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (activity_id, user_id, emoji))`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const mem = () => {
  memory.xpEvents ||= [];
  memory.activity ||= [];
  memory.activityReactions ||= [];
  return memory;
};

// Mural de XP: acontecimento público. Devolve true quando é novo.
export async function recordActivity(userId, { kind, text, xp = 0, dedupe }) {
  await initXp();
  const row = { id: randomUUID(), userId, kind, text: String(text).slice(0, 200), xp, dedupe: String(dedupe).slice(0, 200) };
  if (pool) {
    const result = await pool.query(`INSERT INTO community_activity (id,user_id,kind,text,xp,dedupe) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id, dedupe) DO NOTHING`, [row.id, userId, kind, row.text, xp, row.dedupe]);
    return result.rowCount > 0;
  }
  if (mem().activity.some(item => item.userId === userId && item.dedupe === row.dedupe)) return false;
  mem().activity.push({ ...row, createdAt: Date.now() });
  return true;
}

// Concede (ou tira) XP uma única vez por pessoa + tipo + referência. Devolve true quando valeu agora.
export async function awardXp(userId, kind, ref, { text, xp = xpValues[kind] } = {}) {
  await initXp();
  if (!Number.isInteger(xp)) throw new Error(`Tipo de XP desconhecido: ${kind}`);
  const row = { id: randomUUID(), userId, kind, ref: String(ref).slice(0, 200), xp, text: String(text || xpTexts[kind] || kind).slice(0, 200) };
  let fresh;
  if (pool) {
    const result = await pool.query(`INSERT INTO xp_events (id,user_id,kind,ref,xp,text) VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (user_id, kind, ref) DO NOTHING`, [row.id, userId, kind, row.ref, xp, row.text]);
    fresh = result.rowCount > 0;
  } else {
    fresh = !mem().xpEvents.some(item => item.userId === userId && item.kind === kind && item.ref === row.ref);
    if (fresh) mem().xpEvents.push({ ...row, createdAt: Date.now() });
  }
  if (fresh && xp > 0 && xpTexts[kind]) await recordActivity(userId, { kind, text: `ganhou +${xp} XP ao ${xpTexts[kind].replace(/^(\S+)/, verb => infinitive[verb] || verb)}`, xp, dedupe: `xp:${kind}:${row.ref}` });
  return fresh;
}
const infinitive = { compartilhou: 'compartilhar', reagiu: 'reagir', salvou: 'salvar', publicou: 'publicar' };

export async function listXpEvents(userId) {
  await initXp();
  const rows = pool
    ? (await pool.query('SELECT id, kind, ref, xp, text, created_at AS "createdAt" FROM xp_events WHERE user_id=$1 ORDER BY created_at DESC', [userId])).rows
    : mem().xpEvents.filter(item => item.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
  return rows.map(row => ({ id: row.id, kind: row.kind, ref: row.ref, xp: row.xp, text: row.text, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(row.createdAt)) }));
}

const parse = value => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
};
export const activityEmojis = ['💜', '😂', '🔥', '👏', '👀'];

async function listActivity(viewerId) {
  await initXp();
  let rows;
  let reactions;
  if (pool) {
    rows = (await pool.query(`SELECT a.id, a.user_id AS "userId", a.kind, a.text, a.xp, a.created_at AS "createdAt", u.name, u.avatar_version AS "avatarVersion", u.preferences
      FROM community_activity a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 30`)).rows;
    reactions = rows.length ? (await pool.query('SELECT activity_id AS "activityId", user_id AS "userId", emoji FROM activity_reactions WHERE activity_id = ANY($1)', [rows.map(row => row.id)])).rows : [];
  } else {
    rows = [...mem().activity].sort((a, b) => b.createdAt - a.createdAt).slice(0, 30).map(row => {
      const user = memory.users.find(item => item.id === row.userId) || {};
      return { ...row, name: user.name, avatarVersion: user.avatar_version, preferences: user.preferences };
    });
    reactions = mem().activityReactions.filter(item => rows.some(row => row.id === item.activityId));
  }
  return rows.map(row => {
    // Quem não aparece no Ranking aparece como "Um bruxinho", sem nome nem foto.
    const visible = parse(row.preferences).rankingPublic === true || row.userId === viewerId;
    const mine = reactions.filter(item => item.activityId === row.id);
    return {
      id: row.id, kind: row.kind, text: row.text, xp: row.xp, createdAt: new Date(row.createdAt).toISOString(),
      author: visible ? { id: row.userId, name: publicName(row.name), avatarVersion: row.avatarVersion || '' } : null,
      mine: row.userId === viewerId,
      reactions: activityEmojis.map(emoji => ({ emoji, count: mine.filter(item => item.emoji === emoji).length, reacted: mine.some(item => item.emoji === emoji && item.userId === viewerId) }))
    };
  });
}

export function registerXpRoutes(app, requireAuth) {
  app.get('/api/v1/xp-events', requireAuth, async (req, res, next) => {
    try {
      return res.json(await listXpEvents(req.user.id));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/mural', requireAuth, async (req, res, next) => {
    try {
      return res.json({ items: await listActivity(req.user.id), rules: [
        ['Compartilhar resumo', xpValues['resumo-compartilhado']],
        ['Reagir a resumo (uma vez por resumo)', xpValues['resumo-reacao']],
        ['Salvar resumo de outro estudante', xpValues['resumo-salvo']],
        ['Publicação diária no Feed dos Migles', xpValues['feed-diario']],
        ['Tarefa da Sala de Estudos atrasada', xpValues['tarefa-atrasada']],
        ['Aula registrada com conteúdo', 20], ['Cada minuto salvo no Ritual', 1], ['Simulado terminado', 10], ['Cada questão certa', 3]
      ] });
    } catch (error) {
      return next(error);
    }
  });

  // Reação liga e desliga; a mesma pessoa só tem uma de cada emoji por acontecimento.
  app.post('/api/v1/mural/:id/reactions', requireAuth, async (req, res, next) => {
    try {
      await initXp();
      const emoji = String(req.body?.emoji || '');
      if (!activityEmojis.includes(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
      const id = req.params.id;
      if (pool) {
        if (!(await pool.query('SELECT 1 FROM community_activity WHERE id=$1', [id])).rowCount) return res.status(404).json({ error: 'Acontecimento não encontrado.' });
        const removed = await pool.query('DELETE FROM activity_reactions WHERE activity_id=$1 AND user_id=$2 AND emoji=$3', [id, req.user.id, emoji]);
        if (!removed.rowCount) await pool.query('INSERT INTO activity_reactions (activity_id,user_id,emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [id, req.user.id, emoji]);
      } else {
        if (!mem().activity.some(item => item.id === id)) return res.status(404).json({ error: 'Acontecimento não encontrado.' });
        const list = mem().activityReactions;
        const index = list.findIndex(item => item.activityId === id && item.userId === req.user.id && item.emoji === emoji);
        if (index >= 0) list.splice(index, 1);
        else list.push({ activityId: id, userId: req.user.id, emoji });
      }
      return res.json((await listActivity(req.user.id)).find(item => item.id === id) || null);
    } catch (error) {
      return next(error);
    }
  });
}
