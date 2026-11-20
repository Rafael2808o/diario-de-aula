import { randomUUID } from 'node:crypto';
import { notify } from './notifications.js';
import { can, roleOf } from './roles.js';
import { publicName } from './social.js';
import { initStore, memory, pool } from './store.js';
import { initEntities } from './entities.js';

// Eventos da Comunidade (versão 4.2): estudo em grupo, revisão antes da prova, live, encontro.
// Qualquer pessoa cria; quem criou (ou a moderação) apaga. "Vou" é uma confirmação simples, sem lista de espera.
// Eventos que já passaram somem da lista 6 horas depois do horário (continuam no banco para o histórico).

export const eventKinds = ['estudo', 'revisao', 'live', 'encontro'];
const maxGoing = 12; // avatares devolvidos por evento (a contagem é sempre a total)

let ready;
export function initEvents() {
  ready ||= (async () => {
    await initStore();
    await initEntities();
    if (!pool) {
      memory.events ||= [];
      memory.eventRsvps ||= [];
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS community_events (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind TEXT NOT NULL DEFAULT 'estudo', title TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '',
        event_date TEXT NOT NULL, start_time TEXT NOT NULL DEFAULT '', place TEXT NOT NULL DEFAULT '',
        link TEXT NOT NULL DEFAULT '', details TEXT NOT NULL DEFAULT '', online BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS community_events_date_idx ON community_events(event_date);
      CREATE TABLE IF NOT EXISTS community_event_rsvps (
        event_id TEXT NOT NULL REFERENCES community_events(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (event_id, user_id));`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const cleanLong = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
const isTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const saoPaulo = (date = new Date()) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date).map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
};
export function cleanLink(value) {
  const raw = clean(value, 300);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

// Ainda aparece: dia futuro, ou hoje até 6 horas depois do horário (sem horário, até o fim do dia).
export function stillShown(event, now = new Date()) {
  const later = saoPaulo(new Date(now.getTime() - 6 * 3600_000));
  const today = saoPaulo(now).date;
  if (event.date > today) return true;
  if (event.date < later.date) return false;
  if (!event.startTime) return event.date >= today;
  return `${event.date} ${event.startTime}` >= `${later.date} ${later.time}`;
}

async function listEvents(viewerId) {
  await initEvents();
  const today = saoPaulo(new Date(Date.now() - 6 * 3600_000)).date;
  let rows;
  let rsvps;
  if (pool) {
    rows = (await pool.query(`SELECT e.id, e.user_id AS "userId", e.kind, e.title, e.subject, e.event_date AS date, e.start_time AS "startTime", e.place, e.link,
        e.details, e.online, u.name, u.avatar_version AS "avatarVersion"
      FROM community_events e JOIN users u ON u.id=e.user_id WHERE e.event_date >= $1 ORDER BY e.event_date, e.start_time LIMIT 60`, [today])).rows;
    rsvps = rows.length
      ? (await pool.query(`SELECT r.event_id AS "eventId", r.user_id AS "userId", u.name, u.avatar_version AS "avatarVersion" FROM community_event_rsvps r
          JOIN users u ON u.id=r.user_id WHERE r.event_id = ANY($1) ORDER BY r.created_at`, [rows.map(row => row.id)])).rows
      : [];
  } else {
    const user = id => memory.users.find(item => item.id === id) || {};
    rows = memory.events.filter(item => item.date >= today).sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
      .map(item => ({ ...item, name: user(item.userId).name, avatarVersion: user(item.userId).avatar_version }));
    rsvps = memory.eventRsvps.map(item => ({ ...item, name: user(item.userId).name, avatarVersion: user(item.userId).avatar_version }));
  }
  return rows.filter(row => stillShown(row)).map(row => {
    const going = rsvps.filter(item => item.eventId === row.id);
    return {
      id: row.id, kind: row.kind, title: row.title, subject: row.subject, date: row.date, startTime: row.startTime, place: row.place,
      link: row.link, details: row.details, online: row.online !== false,
      author: { id: row.userId, name: publicName(row.name), avatarVersion: row.avatarVersion || '' },
      mine: row.userId === viewerId,
      goingCount: going.length,
      going: going.slice(0, maxGoing).map(item => ({ id: item.userId, name: publicName(item.name), avatarVersion: item.avatarVersion || '' })),
      imGoing: going.some(item => item.userId === viewerId)
    };
  });
}

async function eventById(id) {
  if (pool) return (await pool.query('SELECT id, user_id AS "userId", title, event_date AS date, start_time AS "startTime" FROM community_events WHERE id=$1', [id])).rows[0];
  return memory.events.find(item => item.id === id);
}

export function registerEventRoutes(app, requireAuth) {
  const route = action => async (req, res, next) => {
    try {
      await initEvents();
      return await action(req, res);
    } catch (error) {
      return next(error);
    }
  };

  app.get('/api/v1/comunidade/eventos', requireAuth, route(async (req, res) => res.json({ kinds: eventKinds, items: await listEvents(req.user.id) })));

  app.post('/api/v1/comunidade/eventos', requireAuth, route(async (req, res) => {
    const body = req.body || {};
    const title = clean(body.title, 90);
    const date = clean(body.date, 10);
    const startTime = clean(body.startTime, 5);
    const link = cleanLink(body.link);
    if (!title) return res.status(400).json({ error: 'Dê um nome ao evento.' });
    if (!isDate(date)) return res.status(400).json({ error: 'Escolha a data do evento.' });
    if (startTime && !isTime(startTime)) return res.status(400).json({ error: 'Use o horário no formato 19:30.' });
    if (link === null) return res.status(400).json({ error: 'Use um link que comece com https://.' });
    const today = saoPaulo().date;
    if (date < today) return res.status(400).json({ error: 'A data já passou.' });
    if (date > `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`) return res.status(400).json({ error: 'Marque eventos para até um ano.' });
    // Limite simples contra spam: até 5 eventos futuros por pessoa.
    const mineCount = pool
      ? Number((await pool.query('SELECT COUNT(*) AS total FROM community_events WHERE user_id=$1 AND event_date >= $2', [req.user.id, today])).rows[0].total)
      : memory.events.filter(item => item.userId === req.user.id && item.date >= today).length;
    if (mineCount >= 5) return res.status(429).json({ error: 'Você já tem 5 eventos marcados. Espere um passar ou apague um.' });
    const event = {
      id: randomUUID(), userId: req.user.id, kind: eventKinds.includes(body.kind) ? body.kind : 'estudo', title, subject: clean(body.subject, 80),
      date, startTime, place: clean(body.place, 80), link, details: cleanLong(body.details, 500), online: body.online !== false
    };
    if (pool) {
      await pool.query(`INSERT INTO community_events (id,user_id,kind,title,subject,event_date,start_time,place,link,details,online) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [event.id, event.userId, event.kind, event.title, event.subject, event.date, event.startTime, event.place, event.link, event.details, event.online]);
      await pool.query('INSERT INTO community_event_rsvps (event_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [event.id, req.user.id]);
    } else {
      memory.events.push(event);
      memory.eventRsvps.push({ eventId: event.id, userId: req.user.id });
    }
    return res.status(201).json({ kinds: eventKinds, items: await listEvents(req.user.id) });
  }));

  app.delete('/api/v1/comunidade/eventos/:id', requireAuth, route(async (req, res) => {
    const event = await eventById(req.params.id);
    if (!event) return res.status(404).json({ error: 'Evento não encontrado.' });
    if (event.userId !== req.user.id && !can.moderate(await roleOf(req.user))) return res.status(403).json({ error: 'Só quem criou pode apagar o evento.' });
    if (pool) await pool.query('DELETE FROM community_events WHERE id=$1', [event.id]);
    else {
      memory.events = memory.events.filter(item => item.id !== event.id);
      memory.eventRsvps = memory.eventRsvps.filter(item => item.eventId !== event.id);
    }
    return res.json({ kinds: eventKinds, items: await listEvents(req.user.id) });
  }));

  // Confirmar ou desfazer presença.
  app.post('/api/v1/comunidade/eventos/:id/presenca', requireAuth, route(async (req, res) => {
    const event = await eventById(req.params.id);
    if (!event || !stillShown(event)) return res.status(404).json({ error: 'Evento não encontrado.' });
    const going = req.body?.going !== false;
    if (pool) {
      if (going) {
        const added = await pool.query('INSERT INTO community_event_rsvps (event_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [event.id, req.user.id]);
        if (added.rowCount && event.userId !== req.user.id) {
          await notify(event.userId, {
            kind: 'evento', key: `evento:${event.id}:${req.user.id}`, title: `${publicName(req.user.name)} vai no seu evento`,
            body: event.title, link: { page: 'comunidade', params: {} }
          }).catch(() => {});
        }
      } else await pool.query('DELETE FROM community_event_rsvps WHERE event_id=$1 AND user_id=$2', [event.id, req.user.id]);
    } else {
      memory.eventRsvps = memory.eventRsvps.filter(item => !(item.eventId === event.id && item.userId === req.user.id));
      if (going) memory.eventRsvps.push({ eventId: event.id, userId: req.user.id });
    }
    return res.json({ kinds: eventKinds, items: await listEvents(req.user.id) });
  }));
}
