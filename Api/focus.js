import { randomInt, randomUUID } from 'node:crypto';
import { notify } from './notifications.js';
import { publicName } from './social.js';
import { initStore, memory, pool } from './store.js';

// Ritual em grupo (versão 4.0): uma sala de foco com amigos, como um canal de voz do Discord, mas sem áudio
// nem vídeo (decisão registrada em docs/grimiau-plano.md: custo de servidor de mídia e consumo de dados).
// - Quem está com a página da sala aberta manda um "pulso" a cada poucos segundos com o próprio estado do
//   Ritual (focando, em pausa, só presente) e a disciplina. Sem pulso por 25 s, a pessoa aparece como fora.
// - Bloco em grupo: alguém começa 25 ou 50 minutos e todos veem a mesma contagem.
// - Chat ao vivo da sala; mensagens com mais de 7 dias são apagadas.

const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 6 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join('');
export const onlineMs = 25_000;
const states = ['focando', 'pausa', 'presente'];
const maxMembers = 30;
const keepMessagesMs = 7 * 86_400_000;
const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

let ready;
export function initFocus() {
  ready ||= (async () => {
    await initStore();
    if (!pool) {
      memory.focusRooms ||= [];
      memory.focusMembers ||= [];
      memory.focusMessages ||= [];
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS focus_rooms (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, code TEXT UNIQUE NOT NULL,
        owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        block_minutes INTEGER, block_ends_at TIMESTAMPTZ, block_by TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS focus_room_members (
        room_id TEXT NOT NULL REFERENCES focus_rooms(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        state TEXT NOT NULL DEFAULT 'presente', subject TEXT NOT NULL DEFAULT '', since TIMESTAMPTZ,
        last_seen TIMESTAMPTZ, joined_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (room_id, user_id));
      CREATE INDEX IF NOT EXISTS focus_room_members_user_idx ON focus_room_members(user_id);
      CREATE TABLE IF NOT EXISTS focus_room_messages (
        id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES focus_rooms(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL, body TEXT NOT NULL, system BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS focus_room_messages_room_idx ON focus_room_messages(room_id, created_at);`);
  })();
  return ready;
}

const memoryUser = id => memory.users.find(user => user.id === id) || {};
const iso = value => (value ? new Date(value).toISOString() : null);

async function roomRow(id) {
  if (pool) {
    return (await pool.query(`SELECT id, name, code, owner_id AS "ownerId", block_minutes AS "blockMinutes", block_ends_at AS "blockEndsAt", block_by AS "blockBy" FROM focus_rooms WHERE id=$1`, [id])).rows[0] || null;
  }
  return memory.focusRooms.find(room => room.id === id) || null;
}

async function membersOf(roomId) {
  if (pool) {
    return (await pool.query(`SELECT m.user_id AS "userId", m.state, m.subject, m.since, m.last_seen AS "lastSeen", u.name, u.avatar_version AS "avatarVersion"
      FROM focus_room_members m JOIN users u ON u.id=m.user_id WHERE m.room_id=$1 ORDER BY m.joined_at`, [roomId])).rows;
  }
  return memory.focusMembers.filter(item => item.roomId === roomId).map(item => ({ ...item, name: memoryUser(item.userId).name, avatarVersion: memoryUser(item.userId).avatar_version }));
}

async function messagesOf(roomId, after) {
  const since = after && !Number.isNaN(Date.parse(after)) ? new Date(after) : null;
  const rows = pool
    ? (await pool.query(`SELECT * FROM (SELECT g.id, g.user_id AS "userId", g.body, g.system, g.created_at AS "createdAt", u.name, u.avatar_version AS "avatarVersion"
        FROM focus_room_messages g LEFT JOIN users u ON u.id=g.user_id WHERE g.room_id=$1 AND ($2::timestamptz IS NULL OR g.created_at > $2)
        ORDER BY g.created_at DESC LIMIT 80) recent ORDER BY "createdAt"`, [roomId, since])).rows
    : memory.focusMessages.filter(item => item.roomId === roomId && (!since || item.createdAt > since)).slice(-80)
      .map(item => ({ ...item, name: memoryUser(item.userId).name, avatarVersion: memoryUser(item.userId).avatar_version }));
  return rows.map(row => ({ id: row.id, body: row.body, system: Boolean(row.system), createdAt: iso(row.createdAt), author: row.userId ? { id: row.userId, name: publicName(row.name || ''), avatarVersion: row.avatarVersion || '' } : null }));
}

async function addMessage(roomId, userId, body, system = false) {
  const message = { id: randomUUID(), roomId, userId, body, system, createdAt: new Date() };
  if (pool) {
    await pool.query('INSERT INTO focus_room_messages (id, room_id, user_id, body, system) VALUES ($1,$2,$3,$4,$5)', [message.id, roomId, userId, body, system]);
    await pool.query('DELETE FROM focus_room_messages WHERE room_id=$1 AND created_at < $2', [roomId, new Date(Date.now() - keepMessagesMs)]);
  } else {
    memory.focusMessages.push(message);
    memory.focusMessages = memory.focusMessages.filter(item => item.createdAt.getTime() > Date.now() - keepMessagesMs);
  }
}

async function view(room, userId, after) {
  const now = Date.now();
  const members = await membersOf(room.id);
  const blockEnds = room.blockEndsAt ? new Date(room.blockEndsAt).getTime() : 0;
  return {
    id: room.id, name: room.name, code: room.code, owner: room.ownerId === userId,
    block: blockEnds > now ? { minutes: room.blockMinutes, endsAt: iso(room.blockEndsAt), by: publicName(members.find(item => item.userId === room.blockBy)?.name || '') } : null,
    people: members.map(item => {
      const online = item.lastSeen && now - new Date(item.lastSeen).getTime() < onlineMs;
      return { id: item.userId, name: publicName(item.name || ''), avatarVersion: item.avatarVersion || '', me: item.userId === userId, online: Boolean(online), state: online ? item.state : 'fora', subject: online ? item.subject : '', since: online ? iso(item.since) : null };
    }).sort((a, b) => Number(b.online) - Number(a.online)),
    messages: await messagesOf(room.id, after),
    serverTime: new Date(now).toISOString()
  };
}

async function addMember(roomId, userId) {
  if (pool) await pool.query('INSERT INTO focus_room_members (room_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roomId, userId]);
  else if (!memory.focusMembers.some(item => item.roomId === roomId && item.userId === userId)) memory.focusMembers.push({ roomId, userId, state: 'presente', subject: '', since: null, lastSeen: null, joinedAt: new Date() });
}

export function registerFocusRoutes(app, requireAuth) {
  const route = action => async (req, res, next) => {
    try {
      await initFocus();
      await action(req, res);
    } catch (error) {
      next(error);
    }
  };
  const member = async (req, res) => {
    const room = await roomRow(req.params.id);
    const members = room ? await membersOf(room.id) : [];
    if (!room || !members.some(item => item.userId === req.user.id)) {
      res.status(404).json({ error: 'Sala de foco não encontrada ou você não está nela.' });
      return null;
    }
    return { room, members };
  };

  app.get('/api/v1/foco/salas', requireAuth, route(async (req, res) => {
    const rooms = pool
      ? (await pool.query(`SELECT r.id, r.name, r.code, r.owner_id AS "ownerId",
          (SELECT count(*)::int FROM focus_room_members x WHERE x.room_id=r.id) AS total,
          (SELECT count(*)::int FROM focus_room_members x WHERE x.room_id=r.id AND x.last_seen > $2) AS online
          FROM focus_rooms r JOIN focus_room_members m ON m.room_id=r.id AND m.user_id=$1 ORDER BY r.created_at DESC`, [req.user.id, new Date(Date.now() - onlineMs)])).rows
      : memory.focusRooms.filter(room => memory.focusMembers.some(item => item.roomId === room.id && item.userId === req.user.id)).map(room => {
        const people = memory.focusMembers.filter(item => item.roomId === room.id);
        return { ...room, total: people.length, online: people.filter(item => item.lastSeen && Date.now() - item.lastSeen.getTime() < onlineMs).length };
      });
    return res.json(rooms.map(room => ({ id: room.id, name: room.name, code: room.code, owner: room.ownerId === req.user.id, total: room.total, online: room.online })));
  }));

  app.post('/api/v1/foco/salas', requireAuth, route(async (req, res) => {
    const name = oneLine(req.body?.name, 60);
    if (name.length < 2) return res.status(400).json({ error: 'Dê um nome para a sala.' });
    const room = { id: randomUUID(), name, code: newCode(), ownerId: req.user.id, blockMinutes: null, blockEndsAt: null, blockBy: null };
    if (pool) await pool.query('INSERT INTO focus_rooms (id, name, code, owner_id) VALUES ($1,$2,$3,$4)', [room.id, name, room.code, req.user.id]);
    else memory.focusRooms.push({ ...room, createdAt: new Date() });
    await addMember(room.id, req.user.id);
    return res.status(201).json(await view(room, req.user.id));
  }));

  app.post('/api/v1/foco/salas/entrar', requireAuth, route(async (req, res) => {
    const code = oneLine(req.body?.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const room = pool
      ? (await pool.query('SELECT id FROM focus_rooms WHERE code=$1', [code])).rows[0]
      : memory.focusRooms.find(item => item.code === code);
    if (!room) return res.status(404).json({ error: 'Código não encontrado. Confira com quem criou a sala.' });
    const members = await membersOf(room.id);
    if (!members.some(item => item.userId === req.user.id) && members.length >= maxMembers) return res.status(409).json({ error: `A sala já tem ${maxMembers} pessoas.` });
    await addMember(room.id, req.user.id);
    return res.json(await view(await roomRow(room.id), req.user.id));
  }));

  app.post('/api/v1/foco/salas/:id/convidar', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const ids = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(String))].filter(id => !found.members.some(item => item.userId === id));
    if (found.members.length + ids.length > maxMembers) return res.status(409).json({ error: `Uma sala comporta até ${maxMembers} pessoas.` });
    for (const id of ids) {
      const exists = pool ? (await pool.query('SELECT 1 FROM users WHERE id=$1', [id])).rowCount : memory.users.some(user => user.id === id);
      if (!exists) continue;
      await addMember(found.room.id, id);
      await notify(id, { kind: 'foco', key: `foco-convite:${found.room.id}:${id}`, title: `${publicName(req.user.name)} chamou você para estudar junto`, body: `Sala de foco: ${found.room.name}`, link: { page: 'foco', params: { id: found.room.id } } }).catch(() => {});
    }
    return res.json(await view(found.room, req.user.id));
  }));

  app.get('/api/v1/foco/salas/:id', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    return res.json(await view(found.room, req.user.id, req.query.after));
  }));

  // Pulso: "estou aqui" + estado do Ritual. Chamado a cada poucos segundos só com a página da sala aberta.
  app.post('/api/v1/foco/salas/:id/pulso', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const state = states.includes(req.body?.state) ? req.body.state : 'presente';
    const subject = oneLine(req.body?.subject, 60);
    const sinceRaw = req.body?.since && !Number.isNaN(Date.parse(req.body.since)) ? new Date(req.body.since) : null;
    const since = sinceRaw && sinceRaw.getTime() <= Date.now() && sinceRaw.getTime() > Date.now() - 86_400_000 ? sinceRaw : null;
    if (pool) await pool.query('UPDATE focus_room_members SET state=$3, subject=$4, since=$5, last_seen=NOW() WHERE room_id=$1 AND user_id=$2', [found.room.id, req.user.id, state, subject, since]);
    else Object.assign(memory.focusMembers.find(item => item.roomId === found.room.id && item.userId === req.user.id), { state, subject, since, lastSeen: new Date() });
    return res.json(await view(found.room, req.user.id, req.body?.after));
  }));

  app.post('/api/v1/foco/salas/:id/mensagens', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const body = String(req.body?.body ?? '').trim().slice(0, 500);
    if (!body) return res.status(400).json({ error: 'Escreva uma mensagem.' });
    await addMessage(found.room.id, req.user.id, body);
    return res.status(201).json(await view(found.room, req.user.id, req.body?.after));
  }));

  // Bloco de foco do grupo: 25 ou 50 minutos, visível para todos. stop encerra antes.
  app.post('/api/v1/foco/salas/:id/bloco', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const stop = req.body?.stop === true;
    const minutes = [25, 50].includes(Number(req.body?.minutes)) ? Number(req.body.minutes) : null;
    if (!stop && !minutes) return res.status(400).json({ error: 'Escolha 25 ou 50 minutos.' });
    const endsAt = stop ? null : new Date(Date.now() + minutes * 60_000);
    if (pool) await pool.query('UPDATE focus_rooms SET block_minutes=$2, block_ends_at=$3, block_by=$4 WHERE id=$1', [found.room.id, stop ? null : minutes, endsAt, stop ? null : req.user.id]);
    else Object.assign(memory.focusRooms.find(item => item.id === found.room.id), { blockMinutes: stop ? null : minutes, blockEndsAt: endsAt, blockBy: stop ? null : req.user.id });
    await addMessage(found.room.id, req.user.id, stop ? `${publicName(req.user.name)} encerrou o bloco do grupo.` : `${publicName(req.user.name)} começou um bloco de ${minutes} minutos. Bora focar!`, true);
    return res.json(await view(await roomRow(found.room.id), req.user.id, req.body?.after));
  }));

  // Sair da sala. Se ninguém ficar, a sala é apagada (com o chat).
  app.post('/api/v1/foco/salas/:id/sair', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    if (pool) {
      await pool.query('DELETE FROM focus_room_members WHERE room_id=$1 AND user_id=$2', [found.room.id, req.user.id]);
      await pool.query('DELETE FROM focus_rooms r WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM focus_room_members m WHERE m.room_id=r.id)', [found.room.id]);
    } else {
      memory.focusMembers = memory.focusMembers.filter(item => !(item.roomId === found.room.id && item.userId === req.user.id));
      if (!memory.focusMembers.some(item => item.roomId === found.room.id)) {
        memory.focusRooms = memory.focusRooms.filter(item => item.id !== found.room.id);
        memory.focusMessages = memory.focusMessages.filter(item => item.roomId !== found.room.id);
      }
    }
    return res.json({ left: true });
  }));
}
