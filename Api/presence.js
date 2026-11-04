import { publicName } from './social.js';
import { initStore, memory, pool } from './store.js';

// Presença na Comunidade: "Online agora" e "Visto por último".
// O navegador manda um sinal (heartbeat) só enquanto a aba está visível e a pessoa mexeu no app há pouco;
// abrir a página e deixá-la parada não conta como atividade. Ao sair (logout ou fechar a aba), o navegador
// avisa e a pessoa deixa de aparecer online na hora. Trocar de app ou de aba não conta como saída: sem sinal,
// o status expira sozinho depois da tolerância, para não ficar piscando entre online e offline.
// A tabela é separada de users para o sinal frequente não regravar a conta. Sai só nome público, foto e horário:
// nada de IP, aparelho ou localização. Quem desligou "Mostrar quando estou online" não aparece na lista.

export const onlineWindowMs = 150_000; // tolerância: 2,5 min sem sinal antes de sair de "online" (o sinal vem a cada 60 s)
const maxListed = 40;
const heartbeatGapMs = 20_000;

const parse = value => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
};

let ready;
function initPresence() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS user_presence (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), left_at TIMESTAMPTZ);
      CREATE INDEX IF NOT EXISTS user_presence_seen_idx ON user_presence(last_seen_at DESC)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const memoryPresence = () => (memory.presence ||= new Map());
const lastWrite = new Map();

async function touch(userId) {
  // Vários sinais seguidos (duas abas, reconexão) gravam no máximo um a cada 20 s.
  const now = Date.now();
  if (now - (lastWrite.get(userId) || 0) < heartbeatGapMs) return;
  lastWrite.set(userId, now);
  await initPresence();
  if (pool) {
    await pool.query(`INSERT INTO user_presence (user_id,last_seen_at,left_at) VALUES ($1,NOW(),NULL)
      ON CONFLICT (user_id) DO UPDATE SET last_seen_at=NOW(), left_at=NULL`, [userId]);
  } else memoryPresence().set(userId, { lastSeenAt: now, leftAt: null });
}

async function leave(userId) {
  lastWrite.delete(userId);
  await initPresence();
  if (pool) await pool.query('UPDATE user_presence SET left_at=NOW() WHERE user_id=$1', [userId]);
  else {
    const item = memoryPresence().get(userId);
    if (item) item.leftAt = Date.now();
  }
}

export const isOnline = ({ lastSeenAt, leftAt }, now = Date.now()) => now - lastSeenAt < onlineWindowMs && !(leftAt && leftAt >= lastSeenAt);

async function members(viewerId) {
  await initPresence();
  let rows;
  if (pool) {
    rows = (await pool.query(`SELECT u.id, u.name, u.avatar_version, u.preferences, p.last_seen_at AS "lastSeenAt", p.left_at AS "leftAt"
      FROM user_presence p JOIN users u ON u.id=p.user_id ORDER BY p.last_seen_at DESC LIMIT 200`)).rows
      .map(row => ({ ...row, lastSeenAt: new Date(row.lastSeenAt).getTime(), leftAt: row.leftAt ? new Date(row.leftAt).getTime() : null }));
  } else {
    rows = [...memoryPresence()].map(([id, item]) => ({ ...memory.users.find(user => user.id === id), ...item }))
      .filter(row => row.id)
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  }
  const now = Date.now();
  return rows
    .filter(row => parse(row.preferences).presenceHidden !== true)
    .slice(0, maxListed)
    .map(row => ({
      id: row.id,
      // Mesmo nome público do Conselho (o apelido das Fases da Lua vale só lá).
      name: publicName(row.name),
      avatarVersion: row.avatar_version || '',
      online: isOnline(row, now),
      lastSeenAt: new Date(row.lastSeenAt).toISOString(),
      me: row.id === viewerId
    }))
    .sort((a, b) => Number(b.online) - Number(a.online) || b.lastSeenAt.localeCompare(a.lastSeenAt));
}

export function registerPresenceRoutes(app, requireAuth) {
  app.post('/api/v1/presence/heartbeat', requireAuth, async (req, res, next) => {
    try {
      await touch(req.user.id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/presence/leave', requireAuth, async (req, res, next) => {
    try {
      await leave(req.user.id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/community/members', requireAuth, async (req, res, next) => {
    try {
      return res.json({ hidden: parse(req.user.preferences).presenceHidden === true, items: await members(req.user.id) });
    } catch (error) {
      return next(error);
    }
  });
}
