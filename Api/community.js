import express from 'express';
import { createHash, randomUUID } from 'node:crypto';
import { notify } from './notifications.js';
import { can, roleOf } from './roles.js';
import { imageMatches, publicName } from './social.js';
import { initStore, memory, pool } from './store.js';
import { awardXp } from './xp.js';

// Comunidade da V3.0: Bate-papo (cartas que somem em 48 h), Comunicados Gerais (só quem tem papel publica)
// e Resumos Compartilhados (biblioteca com reações, comentários e "Salvar no meu Grimório").
// De cada autor sai só o nome público e a versão da foto.

export const letterLifetimeMs = 48 * 3600_000;
export const letterEmojis = ['💜', '😂', '🔥', '👏', '🥹'];
export const noticeCategories = ['Provas', 'Trabalhos', 'Eventos', 'Avisos gerais', 'Alterações acadêmicas', 'Informações importantes'];
export const summaryReactions = { consegui: '✅ Consegui fazer!', 'nao-consegui': '🥲 Não consegui!', dificil: '😵 Achei difícil!', ajudou: '💜 Me ajudou!' };
const summaryMaxBytes = 3 * 1024 * 1024;
const noticeFileMaxBytes = 3 * 1024 * 1024;
const sharesWithXpPerDay = 3;

const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const oneLine = (value, max) => clean(value, max).replace(/\s+/g, ' ');
const iso = value => (value ? new Date(value).toISOString() : null);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
const todayInBrazil = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

let ready;
export function initCommunity() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_letters (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '', body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), expires_at TIMESTAMPTZ NOT NULL);
      CREATE INDEX IF NOT EXISTS chat_letters_expires_idx ON chat_letters(expires_at);
      CREATE TABLE IF NOT EXISTS chat_reactions (
        letter_id TEXT NOT NULL REFERENCES chat_letters(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, emoji TEXT NOT NULL, PRIMARY KEY (letter_id, user_id, emoji));
      CREATE TABLE IF NOT EXISTS chat_comments (
        id TEXT PRIMARY KEY, letter_id TEXT NOT NULL REFERENCES chat_letters(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, event_date TEXT NOT NULL DEFAULT '',
        important BOOLEAN DEFAULT FALSE, archived BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS notice_files (
        notice_id TEXT PRIMARY KEY REFERENCES notices(id) ON DELETE CASCADE, name TEXT NOT NULL, mime TEXT NOT NULL, data BYTEA NOT NULL);
      CREATE TABLE IF NOT EXISTS notice_reads (
        notice_id TEXT NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, read_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (notice_id, user_id));
      CREATE TABLE IF NOT EXISTS summaries (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL, subject_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
        file_name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, content_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS summary_files (
        summary_id TEXT PRIMARY KEY REFERENCES summaries(id) ON DELETE CASCADE, data BYTEA NOT NULL);
      CREATE TABLE IF NOT EXISTS summary_reactions (
        summary_id TEXT NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, PRIMARY KEY (summary_id, user_id, kind));
      CREATE TABLE IF NOT EXISTS summary_comments (
        id TEXT PRIMARY KEY, summary_id TEXT NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS summary_saves (
        summary_id TEXT NOT NULL REFERENCES summaries(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (summary_id, user_id))`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const mem = () => {
  for (const key of ['letters', 'letterReactions', 'letterComments', 'notices', 'noticeReads', 'summaries', 'summaryReactions', 'summaryComments', 'summarySaves']) memory[key] ||= [];
  memory.noticeFiles ||= new Map();
  memory.summaryFiles ||= new Map();
  return memory;
};
const userRow = id => memory.users.find(user => user.id === id) || {};
const author = (id, name, avatarVersion) => ({ id, name: publicName(name), avatarVersion: avatarVersion || '' });

const windows = new Map();
function rateLimit(limit, minutes) {
  return (req, res, next) => {
    const key = `${req.path.split('/')[3]}:${req.user.id}`;
    const now = Date.now();
    const recent = (windows.get(key) || []).filter(time => now - time < minutes * 60_000);
    if (recent.length >= limit) return res.status(429).json({ error: 'Muitas publicações seguidas. Aguarde alguns minutos.' });
    windows.set(key, [...recent, now]);
    return next();
  };
}

// ---------- Limpeza do que expira (cartas em 48 h e fotos do Feed em 24 h) ----------
let lastPurge = 0;
export async function purgeExpired({ force = false } = {}) {
  if (!force && Date.now() - lastPurge < 60_000) return null;
  lastPurge = Date.now();
  await initCommunity();
  const { purgeExpiredPhotos } = await import('./feed.js');
  let letters = 0;
  if (pool) letters = (await pool.query('DELETE FROM chat_letters WHERE expires_at <= NOW()')).rowCount;
  else {
    const now = Date.now();
    const expired = new Set(mem().letters.filter(item => item.expiresAt <= now).map(item => item.id));
    letters = expired.size;
    memory.letters = mem().letters.filter(item => !expired.has(item.id));
    memory.letterComments = mem().letterComments.filter(item => !expired.has(item.letterId));
    memory.letterReactions = mem().letterReactions.filter(item => !expired.has(item.letterId));
  }
  const photos = await purgeExpiredPhotos();
  return { letters, photos };
}
const purgeQuietly = () => purgeExpired().catch(error => console.error('limpeza', error));

// ---------- Bate-papo ----------
async function listLetters(viewerId) {
  await initCommunity();
  let letters;
  let reactions;
  let comments;
  if (pool) {
    letters = (await pool.query(`SELECT l.id, l.user_id AS "userId", l.title, l.body, l.created_at AS "createdAt", l.expires_at AS "expiresAt", u.name, u.avatar_version AS "avatarVersion"
      FROM chat_letters l JOIN users u ON u.id=l.user_id WHERE l.expires_at > NOW() ORDER BY l.created_at DESC LIMIT 100`)).rows;
    const ids = letters.map(row => row.id);
    reactions = ids.length ? (await pool.query('SELECT letter_id AS "letterId", user_id AS "userId", emoji FROM chat_reactions WHERE letter_id = ANY($1)', [ids])).rows : [];
    comments = ids.length ? (await pool.query(`SELECT c.id, c.letter_id AS "letterId", c.user_id AS "userId", c.body, c.created_at AS "createdAt", u.name, u.avatar_version AS "avatarVersion"
      FROM chat_comments c JOIN users u ON u.id=c.user_id WHERE c.letter_id = ANY($1) ORDER BY c.created_at ASC`, [ids])).rows : [];
  } else {
    const now = Date.now();
    letters = mem().letters.filter(item => item.expiresAt > now).sort((a, b) => b.createdAt - a.createdAt).map(item => ({ ...item, name: userRow(item.userId).name, avatarVersion: userRow(item.userId).avatar_version }));
    reactions = mem().letterReactions;
    comments = mem().letterComments.map(item => ({ ...item, name: userRow(item.userId).name, avatarVersion: userRow(item.userId).avatar_version })).sort((a, b) => a.createdAt - b.createdAt);
  }
  return letters.map(row => {
    const mine = reactions.filter(item => item.letterId === row.id);
    return {
      id: row.id, title: row.title, body: row.body, createdAt: iso(row.createdAt), expiresAt: iso(row.expiresAt),
      author: author(row.userId, row.name, row.avatarVersion), mine: row.userId === viewerId,
      reactions: letterEmojis.map(emoji => ({ emoji, count: mine.filter(item => item.emoji === emoji).length, reacted: mine.some(item => item.emoji === emoji && item.userId === viewerId) })),
      comments: comments.filter(item => item.letterId === row.id).map(item => ({ id: item.id, body: item.body, createdAt: iso(item.createdAt), author: author(item.userId, item.name, item.avatarVersion), mine: item.userId === viewerId }))
    };
  });
}

async function letterOwner(id) {
  if (pool) return (await pool.query('SELECT user_id AS "userId", title, body FROM chat_letters WHERE id=$1 AND expires_at > NOW()', [id])).rows[0];
  return mem().letters.find(item => item.id === id && item.expiresAt > Date.now());
}

// ---------- Comunicados ----------
async function listNotices(viewerId, { archived = false } = {}) {
  await initCommunity();
  let rows;
  let reads;
  if (pool) {
    rows = (await pool.query(`SELECT n.id, n.user_id AS "userId", n.title, n.body, n.category, n.event_date AS "eventDate", n.important, n.archived,
      n.created_at AS "createdAt", n.updated_at AS "updatedAt", u.name, u.avatar_version AS "avatarVersion",
      f.name AS "fileName", f.mime AS "fileMime",
      EXISTS (SELECT 1 FROM notice_reads r WHERE r.notice_id=n.id AND r.user_id=$1) AS "read"
      FROM notices n JOIN users u ON u.id=n.user_id LEFT JOIN notice_files f ON f.notice_id=n.id
      WHERE n.archived=$2 ORDER BY n.important DESC, n.created_at DESC LIMIT 100`, [viewerId, archived])).rows;
  } else {
    reads = mem().noticeReads;
    rows = mem().notices.filter(item => item.archived === archived)
      .sort((a, b) => Number(b.important) - Number(a.important) || b.createdAt - a.createdAt)
      .map(item => ({ ...item, name: userRow(item.userId).name, avatarVersion: userRow(item.userId).avatar_version, fileName: memory.noticeFiles.get(item.id)?.name, fileMime: memory.noticeFiles.get(item.id)?.mime, read: reads.some(read => read.noticeId === item.id && read.userId === viewerId) }));
  }
  return rows.map(row => ({
    id: row.id, title: row.title, body: row.body, category: row.category, eventDate: row.eventDate || '', important: Boolean(row.important), archived: Boolean(row.archived),
    createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt), author: author(row.userId, row.name, row.avatarVersion), mine: row.userId === viewerId,
    file: row.fileName ? { name: row.fileName, mime: row.fileMime } : null, read: Boolean(row.read)
  }));
}

function noticeInput(body) {
  const title = oneLine(body?.title, 160);
  const text = clean(body?.body, 4000);
  const category = oneLine(body?.category, 40);
  const eventDate = clean(body?.eventDate, 10);
  if (title.length < 3) return { error: 'Escreva um título com pelo menos 3 letras.' };
  if (!noticeCategories.includes(category)) return { error: 'Escolha uma categoria.' };
  if (eventDate && !isDate(eventDate)) return { error: 'Use uma data válida.' };
  return { notice: { title, body: text, category, eventDate, important: body?.important === true } };
}

function fileInput(file, maxBytes, { pdfOrImage = true } = {}) {
  if (!file) return { file: null };
  const mime = String(file.mime || '');
  const data = Buffer.from(String(file.data || ''), 'base64');
  const name = oneLine(file.name, 120) || 'arquivo';
  const isPdf = mime === 'application/pdf' && data.subarray(0, 5).toString() === '%PDF-';
  const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(mime) && imageMatches(mime, data);
  if (pdfOrImage && !isPdf && !isImage) return { error: 'Envie um PDF ou uma imagem (JPG, PNG ou WebP).' };
  if (!data.length) return { error: 'O arquivo está vazio.' };
  if (data.length > maxBytes) return { error: `O arquivo precisa ter até ${Math.round(maxBytes / 1024 / 1024)} MB.` };
  return { file: { name, mime, data } };
}

async function canEditNotice(user, noticeId) {
  const role = await roleOf(user);
  if (can.moderate(role)) return true;
  if (!can.publishNotice(role)) return false;
  const row = pool ? (await pool.query('SELECT user_id AS "userId" FROM notices WHERE id=$1', [noticeId])).rows[0] : mem().notices.find(item => item.id === noticeId);
  return row?.userId === user.id;
}

async function notifyEveryone(exceptId, payload) {
  const ids = pool ? (await pool.query('SELECT id FROM users WHERE id <> $1', [exceptId])).rows.map(row => row.id) : memory.users.filter(user => user.id !== exceptId).map(user => user.id);
  for (const id of ids) await notify(id, payload).catch(error => console.error('aviso de comunicado', error));
}

// ---------- Resumos ----------
async function listSummaries(viewerId, { id } = {}) {
  await initCommunity();
  let rows;
  let reactions;
  let comments = [];
  let saves;
  if (pool) {
    rows = (await pool.query(`SELECT s.id, s.user_id AS "userId", s.title, s.subject_name AS "subject", s.description, s.file_name AS "fileName", s.mime, s.size,
      s.created_at AS "createdAt", u.name, u.avatar_version AS "avatarVersion",
      (SELECT COUNT(*) FROM summary_comments c WHERE c.summary_id=s.id) AS "commentCount"
      FROM summaries s JOIN users u ON u.id=s.user_id ${id ? 'WHERE s.id=$1' : ''} ORDER BY s.created_at DESC LIMIT 200`, id ? [id] : [])).rows;
    const ids = rows.map(row => row.id);
    reactions = ids.length ? (await pool.query('SELECT summary_id AS "summaryId", user_id AS "userId", kind FROM summary_reactions WHERE summary_id = ANY($1)', [ids])).rows : [];
    saves = ids.length ? (await pool.query('SELECT summary_id AS "summaryId" FROM summary_saves WHERE user_id=$1 AND summary_id = ANY($2)', [viewerId, ids])).rows : [];
    if (id) comments = (await pool.query(`SELECT c.id, c.user_id AS "userId", c.body, c.created_at AS "createdAt", u.name, u.avatar_version AS "avatarVersion"
      FROM summary_comments c JOIN users u ON u.id=c.user_id WHERE c.summary_id=$1 ORDER BY c.created_at ASC`, [id])).rows;
  } else {
    rows = mem().summaries.filter(item => !id || item.id === id).sort((a, b) => b.createdAt - a.createdAt)
      .map(item => ({ ...item, name: userRow(item.userId).name, avatarVersion: userRow(item.userId).avatar_version, commentCount: mem().summaryComments.filter(c => c.summaryId === item.id).length }));
    reactions = mem().summaryReactions;
    saves = mem().summarySaves.filter(item => item.userId === viewerId);
    if (id) comments = mem().summaryComments.filter(item => item.summaryId === id).map(item => ({ ...item, name: userRow(item.userId).name, avatarVersion: userRow(item.userId).avatar_version }));
  }
  return rows.map(row => {
    const own = reactions.filter(item => item.summaryId === row.id);
    return {
      id: row.id, title: row.title, subject: row.subject, description: row.description, createdAt: iso(row.createdAt),
      file: { name: row.fileName, mime: row.mime, size: Number(row.size) }, author: author(row.userId, row.name, row.avatarVersion), mine: row.userId === viewerId,
      commentCount: Number(row.commentCount || 0), saved: saves.some(item => item.summaryId === row.id),
      reactions: Object.entries(summaryReactions).map(([kind, label]) => ({ kind, label, count: own.filter(item => item.kind === kind).length, reacted: own.some(item => item.kind === kind && item.userId === viewerId) })),
      ...(id ? { comments: comments.map(item => ({ id: item.id, body: item.body, createdAt: iso(item.createdAt), author: author(item.userId, item.name, item.avatarVersion), mine: item.userId === viewerId })) } : {})
    };
  });
}

async function summaryRow(id) {
  if (pool) return (await pool.query('SELECT id, user_id AS "userId", title, subject_name AS "subject", mime, file_name AS "fileName" FROM summaries WHERE id=$1', [id])).rows[0];
  return mem().summaries.find(item => item.id === id);
}

async function sharesToday(userId) {
  const events = pool
    ? (await pool.query(`SELECT COUNT(*) FROM xp_events WHERE user_id=$1 AND kind='resumo-compartilhado' AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date`, [userId])).rows[0].count
    : (memory.xpEvents || []).filter(item => item.userId === userId && item.kind === 'resumo-compartilhado' && new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(item.createdAt)) === todayInBrazil()).length;
  return Number(events);
}

// ---------- Resumo da Comunidade (indicadores de novidade) ----------
async function latestByArea() {
  await initCommunity();
  if (pool) {
    const row = (await pool.query(`SELECT
      (SELECT MAX(created_at) FROM community_posts) AS conselho,
      (SELECT MAX(created_at) FROM chat_letters WHERE expires_at > NOW()) AS batepapo,
      (SELECT MAX(created_at) FROM notices WHERE NOT archived) AS comunicados,
      (SELECT MAX(created_at) FROM summaries) AS resumos,
      (SELECT MAX(created_at) FROM feed_photos WHERE expires_at IS NULL OR expires_at > NOW()) AS feed`)).rows[0];
    return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, iso(value)]));
  }
  const max = list => (list.length ? iso(Math.max(...list.map(item => item.createdAt))) : null);
  return { conselho: max(memory.posts || []), batepapo: max(mem().letters.filter(item => item.expiresAt > Date.now())), comunicados: max(mem().notices.filter(item => !item.archived)), resumos: max(mem().summaries), feed: max((memory.feedPhotos || []).filter(item => !item.expiresAt || item.expiresAt > Date.now())) };
}

const handle = fn => async (req, res, next) => {
  try {
    return await fn(req, res);
  } catch (error) {
    return next(error);
  }
};

export function registerCommunityRoutes(app, requireAuth) {
  // Limpeza também roda sozinha a cada 30 min enquanto o servidor estiver acordado,
  // e por um agendador externo (POST /api/v1/internal/purge com CRON_SECRET).
  const timer = setInterval(() => purgeExpired({ force: true }).catch(error => console.error('limpeza', error)), 30 * 60_000);
  timer.unref?.();
  app.post('/api/v1/internal/purge', handle(async (req, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.get('x-cron-secret') !== secret) return res.status(401).json({ error: 'Não autorizado.' });
    return res.json(await purgeExpired({ force: true }));
  }));

  app.get('/api/v1/community/summary', requireAuth, handle(async (req, res) => {
    purgeQuietly();
    return res.json({ latest: await latestByArea(), role: await roleOf(req.user) });
  }));

  // Bate-papo
  app.get('/api/v1/batepapo', requireAuth, handle(async (req, res) => {
    await purgeExpired();
    return res.json(await listLetters(req.user.id));
  }));
  app.post('/api/v1/batepapo', express.json({ limit: '64kb' }), requireAuth, rateLimit(12, 60), handle(async (req, res) => {
    await initCommunity();
    const title = oneLine(req.body?.title, 120);
    const body = clean(req.body?.body, 2000);
    if (body.length < 2) return res.status(400).json({ error: 'Escreva a mensagem da cartinha.' });
    const id = randomUUID();
    const expiresAt = Date.now() + letterLifetimeMs;
    if (pool) await pool.query('INSERT INTO chat_letters (id,user_id,title,body,expires_at) VALUES ($1,$2,$3,$4,$5)', [id, req.user.id, title, body, new Date(expiresAt)]);
    else mem().letters.push({ id, userId: req.user.id, title, body, createdAt: Date.now(), expiresAt });
    return res.status(201).json((await listLetters(req.user.id)).find(item => item.id === id));
  }));
  app.delete('/api/v1/batepapo/:id', requireAuth, handle(async (req, res) => {
    await initCommunity();
    let removed;
    if (pool) removed = (await pool.query('DELETE FROM chat_letters WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
    else {
      const before = mem().letters.length;
      memory.letters = mem().letters.filter(item => !(item.id === req.params.id && item.userId === req.user.id));
      removed = before - memory.letters.length;
    }
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem escreveu pode apagar.' });
  }));
  app.post('/api/v1/batepapo/:id/reactions', requireAuth, handle(async (req, res) => {
    await initCommunity();
    const emoji = String(req.body?.emoji || '');
    if (!letterEmojis.includes(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
    const letter = await letterOwner(req.params.id);
    if (!letter) return res.status(404).json({ error: 'Esta cartinha já expirou.' });
    let added;
    if (pool) {
      const removed = await pool.query('DELETE FROM chat_reactions WHERE letter_id=$1 AND user_id=$2 AND emoji=$3', [req.params.id, req.user.id, emoji]);
      added = !removed.rowCount;
      if (added) await pool.query('INSERT INTO chat_reactions (letter_id,user_id,emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id, req.user.id, emoji]);
    } else {
      const list = mem().letterReactions;
      const index = list.findIndex(item => item.letterId === req.params.id && item.userId === req.user.id && item.emoji === emoji);
      added = index < 0;
      if (added) list.push({ letterId: req.params.id, userId: req.user.id, emoji });
      else list.splice(index, 1);
    }
    if (added && letter.userId !== req.user.id) await notify(letter.userId, { kind: 'comunidade', key: `cartinha-reacao:${req.params.id}:${req.user.id}:${emoji}`, title: `${publicName(req.user.name)} reagiu ${emoji} à sua cartinha`, body: letter.title || letter.body.slice(0, 80), link: { page: 'batepapo' } }).catch(() => {});
    return res.json((await listLetters(req.user.id)).find(item => item.id === req.params.id));
  }));
  app.post('/api/v1/batepapo/:id/comments', requireAuth, rateLimit(30, 10), handle(async (req, res) => {
    await initCommunity();
    const body = clean(req.body?.body, 1000);
    if (!body) return res.status(400).json({ error: 'Escreva a resposta.' });
    const letter = await letterOwner(req.params.id);
    if (!letter) return res.status(404).json({ error: 'Esta cartinha já expirou.' });
    const id = randomUUID();
    if (pool) await pool.query('INSERT INTO chat_comments (id,letter_id,user_id,body) VALUES ($1,$2,$3,$4)', [id, req.params.id, req.user.id, body]);
    else mem().letterComments.push({ id, letterId: req.params.id, userId: req.user.id, body, createdAt: Date.now() });
    if (letter.userId !== req.user.id) await notify(letter.userId, { kind: 'comunidade', key: `cartinha-resposta:${id}`, title: `${publicName(req.user.name)} respondeu sua cartinha`, body: body.slice(0, 120), link: { page: 'batepapo' } }).catch(() => {});
    return res.status(201).json((await listLetters(req.user.id)).find(item => item.id === req.params.id));
  }));
  app.delete('/api/v1/batepapo/comments/:id', requireAuth, handle(async (req, res) => {
    await initCommunity();
    let removed;
    if (pool) removed = (await pool.query('DELETE FROM chat_comments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
    else {
      const before = mem().letterComments.length;
      memory.letterComments = mem().letterComments.filter(item => !(item.id === req.params.id && item.userId === req.user.id));
      removed = before - memory.letterComments.length;
    }
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem respondeu pode apagar.' });
  }));

  // Comunicados Gerais
  app.get('/api/v1/comunicados', requireAuth, handle(async (req, res) => {
    const archived = req.query.arquivados === '1';
    if (archived && !can.publishNotice(await roleOf(req.user))) return res.status(403).json({ error: 'Só quem publica comunicados vê os arquivados.' });
    return res.json(await listNotices(req.user.id, { archived }));
  }));
  app.post('/api/v1/comunicados', express.json({ limit: '4400kb' }), requireAuth, rateLimit(20, 60), handle(async (req, res) => {
    if (!can.publishNotice(await roleOf(req.user))) return res.status(403).json({ error: 'Só administração, moderação e publicadores autorizados publicam comunicados.' });
    const { notice, error } = noticeInput(req.body);
    if (error) return res.status(400).json({ error });
    const upload = fileInput(req.body?.file, noticeFileMaxBytes);
    if (upload.error) return res.status(400).json({ error: upload.error });
    await initCommunity();
    const id = randomUUID();
    if (pool) {
      await pool.query('INSERT INTO notices (id,user_id,title,body,category,event_date,important) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, req.user.id, notice.title, notice.body, notice.category, notice.eventDate, notice.important]);
      if (upload.file) await pool.query('INSERT INTO notice_files (notice_id,name,mime,data) VALUES ($1,$2,$3,$4)', [id, upload.file.name, upload.file.mime, upload.file.data]);
    } else {
      mem().notices.push({ id, userId: req.user.id, ...notice, archived: false, createdAt: Date.now(), updatedAt: Date.now() });
      if (upload.file) memory.noticeFiles.set(id, upload.file);
    }
    if (notice.important) await notifyEveryone(req.user.id, { kind: 'comunicado', key: `comunicado:${id}`, title: `Comunicado importante: ${notice.title}`, body: notice.body.slice(0, 160), link: { page: 'comunicados' } });
    return res.status(201).json((await listNotices(req.user.id)).find(item => item.id === id));
  }));
  app.patch('/api/v1/comunicados/:id', requireAuth, handle(async (req, res) => {
    if (!(await canEditNotice(req.user, req.params.id))) return res.status(403).json({ error: 'Você não pode alterar este comunicado.' });
    await initCommunity();
    const archivedOnly = req.body && Object.keys(req.body).length === 1 && 'archived' in req.body;
    if (archivedOnly) {
      const archived = req.body.archived === true;
      if (pool) await pool.query('UPDATE notices SET archived=$2, updated_at=NOW() WHERE id=$1', [req.params.id, archived]);
      else Object.assign(mem().notices.find(item => item.id === req.params.id) || {}, { archived, updatedAt: Date.now() });
      return res.json((await listNotices(req.user.id, { archived })).find(item => item.id === req.params.id) || null);
    }
    const { notice, error } = noticeInput(req.body);
    if (error) return res.status(400).json({ error });
    if (pool) await pool.query('UPDATE notices SET title=$2, body=$3, category=$4, event_date=$5, important=$6, updated_at=NOW() WHERE id=$1', [req.params.id, notice.title, notice.body, notice.category, notice.eventDate, notice.important]);
    else Object.assign(mem().notices.find(item => item.id === req.params.id) || {}, notice, { updatedAt: Date.now() });
    return res.json((await listNotices(req.user.id)).find(item => item.id === req.params.id) || null);
  }));
  app.delete('/api/v1/comunicados/:id', requireAuth, handle(async (req, res) => {
    if (!(await canEditNotice(req.user, req.params.id))) return res.status(403).json({ error: 'Você não pode excluir este comunicado.' });
    await initCommunity();
    if (pool) await pool.query('DELETE FROM notices WHERE id=$1', [req.params.id]);
    else {
      memory.notices = mem().notices.filter(item => item.id !== req.params.id);
      memory.noticeFiles.delete(req.params.id);
    }
    return res.status(204).end();
  }));
  app.post('/api/v1/comunicados/:id/lido', requireAuth, handle(async (req, res) => {
    await initCommunity();
    if (pool) await pool.query('INSERT INTO notice_reads (notice_id,user_id) SELECT id, $2 FROM notices WHERE id=$1 ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
    else if (!mem().noticeReads.some(item => item.noticeId === req.params.id && item.userId === req.user.id)) mem().noticeReads.push({ noticeId: req.params.id, userId: req.user.id });
    return res.status(204).end();
  }));
  app.get('/api/v1/comunicados/:id/arquivo', handle(async (req, res) => {
    await initCommunity();
    const file = pool ? (await pool.query('SELECT name, mime, data FROM notice_files WHERE notice_id=$1', [req.params.id])).rows[0] : memory.noticeFiles?.get(req.params.id);
    if (!file) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    res.set('Cache-Control', 'private, max-age=3600').type(file.mime).set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    return res.send(Buffer.from(file.data));
  }));

  // Resumos Compartilhados
  app.get('/api/v1/resumos', requireAuth, handle(async (req, res) => res.json(await listSummaries(req.user.id))));
  app.get('/api/v1/resumos/:id', requireAuth, handle(async (req, res) => {
    const [item] = await listSummaries(req.user.id, { id: req.params.id });
    return item ? res.json(item) : res.status(404).json({ error: 'Resumo não encontrado.' });
  }));
  app.post('/api/v1/resumos', express.json({ limit: '4400kb' }), requireAuth, rateLimit(10, 60), handle(async (req, res) => {
    const title = oneLine(req.body?.title, 160);
    const subject = oneLine(req.body?.subject, 100);
    const description = clean(req.body?.description, 1500);
    if (title.length < 3) return res.status(400).json({ error: 'Dê um nome ao resumo.' });
    if (!subject) return res.status(400).json({ error: 'Informe a disciplina.' });
    const upload = fileInput(req.body?.file, summaryMaxBytes);
    if (upload.error) return res.status(400).json({ error: upload.error });
    if (!upload.file) return res.status(400).json({ error: 'Anexe o arquivo do resumo (PDF ou imagem).' });
    await initCommunity();
    const id = randomUUID();
    const hash = createHash('sha256').update(upload.file.data).digest('hex');
    if (pool) {
      await pool.query('INSERT INTO summaries (id,user_id,title,subject_name,description,file_name,mime,size,content_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)', [id, req.user.id, title, subject, description, upload.file.name, upload.file.mime, upload.file.data.length, hash]);
      await pool.query('INSERT INTO summary_files (summary_id,data) VALUES ($1,$2)', [id, upload.file.data]);
    } else {
      mem().summaries.push({ id, userId: req.user.id, title, subject, description, fileName: upload.file.name, mime: upload.file.mime, size: upload.file.data.length, hash, createdAt: Date.now() });
      memory.summaryFiles.set(id, upload.file.data);
    }
    // +50 XP: uma vez por arquivo (o mesmo arquivo publicado de novo não conta) e até 3 por dia.
    let xp = 0;
    if ((await sharesToday(req.user.id)) < sharesWithXpPerDay && (await awardXp(req.user.id, 'resumo-compartilhado', hash, { text: `Resumo compartilhado: ${title}` }))) xp = 50;
    const [item] = await listSummaries(req.user.id, { id });
    return res.status(201).json({ ...item, xpAwarded: xp });
  }));
  app.delete('/api/v1/resumos/:id', requireAuth, handle(async (req, res) => {
    await initCommunity();
    let removed;
    if (pool) removed = (await pool.query('DELETE FROM summaries WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
    else {
      const before = mem().summaries.length;
      memory.summaries = mem().summaries.filter(item => !(item.id === req.params.id && item.userId === req.user.id));
      removed = before - memory.summaries.length;
      if (removed) memory.summaryFiles.delete(req.params.id);
    }
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem compartilhou pode excluir.' });
  }));
  app.get('/api/v1/resumos/:id/arquivo', handle(async (req, res) => {
    await initCommunity();
    const row = await summaryRow(req.params.id);
    const data = row && (pool ? (await pool.query('SELECT data FROM summary_files WHERE summary_id=$1', [req.params.id])).rows[0]?.data : memory.summaryFiles.get(req.params.id));
    if (!data) return res.status(404).json({ error: 'Arquivo não encontrado.' });
    res.set('Cache-Control', 'private, max-age=3600').type(row.mime).set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`);
    return res.send(Buffer.from(data));
  }));
  app.post('/api/v1/resumos/:id/reactions', requireAuth, handle(async (req, res) => {
    await initCommunity();
    const kind = String(req.body?.kind || '');
    if (!(kind in summaryReactions)) return res.status(400).json({ error: 'Reação inválida.' });
    const row = await summaryRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Resumo não encontrado.' });
    let added;
    if (pool) {
      const removed = await pool.query('DELETE FROM summary_reactions WHERE summary_id=$1 AND user_id=$2 AND kind=$3', [req.params.id, req.user.id, kind]);
      added = !removed.rowCount;
      if (added) await pool.query('INSERT INTO summary_reactions (summary_id,user_id,kind) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id, req.user.id, kind]);
    } else {
      const list = mem().summaryReactions;
      const index = list.findIndex(item => item.summaryId === req.params.id && item.userId === req.user.id && item.kind === kind);
      added = index < 0;
      if (added) list.push({ summaryId: req.params.id, userId: req.user.id, kind });
      else list.splice(index, 1);
    }
    // +20 XP uma vez por resumo de outra pessoa (tirar e pôr a reação de novo não dá mais XP).
    let xp = 0;
    if (added && row.userId !== req.user.id && (await awardXp(req.user.id, 'resumo-reacao', req.params.id, { text: `Reagiu ao resumo: ${row.title}` }))) xp = 20;
    if (added && row.userId !== req.user.id) await notify(row.userId, { kind: 'comunidade', key: `resumo-reacao:${req.params.id}:${req.user.id}:${kind}`, title: `${publicName(req.user.name)} reagiu ao seu resumo`, body: `${summaryReactions[kind]} ${row.title}`, link: { page: 'resumos', params: { id: req.params.id } } }).catch(() => {});
    const [item] = await listSummaries(req.user.id, { id: req.params.id });
    return res.json({ ...item, xpAwarded: xp });
  }));
  app.post('/api/v1/resumos/:id/comments', requireAuth, rateLimit(30, 10), handle(async (req, res) => {
    await initCommunity();
    const body = clean(req.body?.body, 1500);
    if (!body) return res.status(400).json({ error: 'Escreva o comentário.' });
    const row = await summaryRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Resumo não encontrado.' });
    const id = randomUUID();
    if (pool) await pool.query('INSERT INTO summary_comments (id,summary_id,user_id,body) VALUES ($1,$2,$3,$4)', [id, req.params.id, req.user.id, body]);
    else mem().summaryComments.push({ id, summaryId: req.params.id, userId: req.user.id, body, createdAt: Date.now() });
    if (row.userId !== req.user.id) await notify(row.userId, { kind: 'comunidade', key: `resumo-comentario:${id}`, title: `${publicName(req.user.name)} comentou seu resumo`, body: body.slice(0, 120), link: { page: 'resumos', params: { id: req.params.id } } }).catch(() => {});
    const [item] = await listSummaries(req.user.id, { id: req.params.id });
    return res.status(201).json(item);
  }));
  app.delete('/api/v1/resumos/comments/:id', requireAuth, handle(async (req, res) => {
    await initCommunity();
    let removed;
    if (pool) removed = (await pool.query('DELETE FROM summary_comments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
    else {
      const before = mem().summaryComments.length;
      memory.summaryComments = mem().summaryComments.filter(item => !(item.id === req.params.id && item.userId === req.user.id));
      removed = before - memory.summaryComments.length;
    }
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem comentou pode apagar.' });
  }));
  // Salvar no meu Grimório: registra o salvamento (e o XP, se o resumo é de outra pessoa).
  // O material com a referência ao arquivo é criado pela própria conta, na disciplina escolhida.
  app.post('/api/v1/resumos/:id/salvar', requireAuth, handle(async (req, res) => {
    await initCommunity();
    const row = await summaryRow(req.params.id);
    if (!row) return res.status(404).json({ error: 'Resumo não encontrado.' });
    if (pool) await pool.query('INSERT INTO summary_saves (summary_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.params.id, req.user.id]);
    else if (!mem().summarySaves.some(item => item.summaryId === req.params.id && item.userId === req.user.id)) mem().summarySaves.push({ summaryId: req.params.id, userId: req.user.id });
    let xp = 0;
    if (row.userId !== req.user.id && (await awardXp(req.user.id, 'resumo-salvo', req.params.id, { text: `Salvou o resumo: ${row.title}` }))) xp = 40;
    const ownerName = pool ? (await pool.query('SELECT name FROM users WHERE id=$1', [row.userId])).rows[0]?.name : userRow(row.userId).name;
    return res.json({ xpAwarded: xp, author: publicName(ownerName), fileName: row.fileName, mime: row.mime });
  }));
}
