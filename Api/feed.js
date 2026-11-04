import express from 'express';
import { randomUUID } from 'node:crypto';
import { notify } from './notifications.js';
import { imageMatches, publicName } from './social.js';
import { initStore, memory, pool } from './store.js';
import { awardXp } from './xp.js';

// Feed dos Migles: fotos de estudo compartilhadas com toda a comunidade, disponíveis por 24 horas.
// O navegador reduz a foto antes de enviar (lado maior de até 1600 px); o servidor guarda só esse arquivo
// (não há miniaturas nem cópias processadas). Ao expirar, a linha e a imagem saem do banco, junto com
// curtidas, reações e comentários (ON DELETE CASCADE). +200 XP na primeira foto de cada dia (horário de Brasília):
// apagar e publicar de novo no mesmo dia não dá XP outra vez.

export const feedPhotoMaxBytes = 700 * 1024;
export const photoLifetimeMs = 24 * 3600_000;
export const feedEmojis = ['❤️', '✨', '😂', '🔥', '🥹'];
const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const pageSize = 30;
const todayInBrazil = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);

let ready;
function initFeed() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS feed_photos (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mime TEXT NOT NULL, data BYTEA NOT NULL, width INTEGER DEFAULT 0, height INTEGER DEFAULT 0,
      caption TEXT NOT NULL DEFAULT '', inspired BOOLEAN DEFAULT FALSE, inspiration TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS feed_photos_created_idx ON feed_photos(created_at DESC);
      ALTER TABLE feed_photos ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
      -- Fotos de antes da regra de 24 h ganham 24 h a partir de agora, em vez de sumirem na hora.
      UPDATE feed_photos SET expires_at = NOW() + INTERVAL '24 hours' WHERE expires_at IS NULL;
      CREATE INDEX IF NOT EXISTS feed_photos_expires_idx ON feed_photos(expires_at);
      CREATE TABLE IF NOT EXISTS feed_reactions (
        photo_id TEXT NOT NULL REFERENCES feed_photos(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, emoji TEXT NOT NULL, PRIMARY KEY (photo_id, user_id, emoji));
      CREATE TABLE IF NOT EXISTS feed_comments (
        id TEXT PRIMARY KEY, photo_id TEXT NOT NULL REFERENCES feed_photos(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW())`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const size = value => Math.max(0, Math.min(10_000, Number.parseInt(value, 10) || 0));
const memoryPhotos = () => (memory.feedPhotos ||= []);
const memoryReactions = () => (memory.feedReactions ||= []);
const memoryComments = () => (memory.feedComments ||= []);
const memoryUser = id => memory.users.find(user => user.id === id) || {};
const author = (id, name, avatarVersion) => ({ id, name: publicName(name), avatarVersion: avatarVersion || '' });

// Remove as fotos vencidas e tudo ligado a elas. Devolve quantas saíram.
export async function purgeExpiredPhotos() {
  await initFeed();
  if (pool) return (await pool.query('DELETE FROM feed_photos WHERE expires_at <= NOW()')).rowCount;
  const now = Date.now();
  const expired = new Set(memoryPhotos().filter(photo => photo.expiresAt <= now).map(photo => photo.id));
  memory.feedPhotos = memoryPhotos().filter(photo => !expired.has(photo.id));
  memory.feedReactions = memoryReactions().filter(item => !expired.has(item.photoId));
  memory.feedComments = memoryComments().filter(item => !expired.has(item.photoId));
  return expired.size;
}

const publicPhoto = (row, viewerId, reactions = [], comments = []) => {
  const mine = reactions.filter(item => item.photoId === row.id);
  return {
    id: row.id, caption: row.caption, inspired: Boolean(row.inspired), inspiration: row.inspiration || '',
    width: Number(row.width) || 0, height: Number(row.height) || 0,
    createdAt: new Date(row.createdAt).toISOString(), expiresAt: new Date(row.expiresAt).toISOString(),
    author: author(row.userId, row.authorName, row.avatarVersion),
    mine: row.userId === viewerId,
    reactions: feedEmojis.map(emoji => ({ emoji, count: mine.filter(item => item.emoji === emoji).length, reacted: mine.some(item => item.emoji === emoji && item.userId === viewerId) })),
    comments: comments.filter(item => item.photoId === row.id).map(item => ({ id: item.id, body: item.body, createdAt: new Date(item.createdAt).toISOString(), author: author(item.userId, item.name, item.avatarVersion), mine: item.userId === viewerId }))
  };
};

async function listPhotos(viewerId, { before = '', id = '' } = {}) {
  await initFeed();
  if (pool) {
    const values = [];
    const where = ['f.expires_at > NOW()'];
    if (before) {
      values.push(before);
      where.push(`f.created_at < $${values.length}`);
    }
    if (id) {
      values.push(id);
      where.push(`f.id = $${values.length}`);
    }
    const rows = (await pool.query(`SELECT f.id, f.user_id AS "userId", f.caption, f.inspired, f.inspiration, f.width, f.height, f.created_at AS "createdAt", f.expires_at AS "expiresAt",
      u.name AS "authorName", u.avatar_version AS "avatarVersion"
      FROM feed_photos f JOIN users u ON u.id=f.user_id WHERE ${where.join(' AND ')} ORDER BY f.created_at DESC LIMIT ${pageSize}`, values)).rows;
    const ids = rows.map(row => row.id);
    const reactions = ids.length ? (await pool.query('SELECT photo_id AS "photoId", user_id AS "userId", emoji FROM feed_reactions WHERE photo_id = ANY($1)', [ids])).rows : [];
    const comments = ids.length ? (await pool.query(`SELECT c.id, c.photo_id AS "photoId", c.user_id AS "userId", c.body, c.created_at AS "createdAt", u.name, u.avatar_version AS "avatarVersion"
      FROM feed_comments c JOIN users u ON u.id=c.user_id WHERE c.photo_id = ANY($1) ORDER BY c.created_at ASC`, [ids])).rows : [];
    return rows.map(row => publicPhoto(row, viewerId, reactions, comments));
  }
  const limit = before ? new Date(before).getTime() : Infinity;
  const now = Date.now();
  const comments = memoryComments().map(item => ({ ...item, name: memoryUser(item.userId).name, avatarVersion: memoryUser(item.userId).avatar_version })).sort((a, b) => a.createdAt - b.createdAt);
  return memoryPhotos()
    .filter(photo => photo.expiresAt > now && photo.createdAt < limit && (!id || photo.id === id))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, pageSize)
    .map(photo => publicPhoto({ ...photo, authorName: memoryUser(photo.userId).name, avatarVersion: memoryUser(photo.userId).avatar_version }, viewerId, memoryReactions(), comments));
}

async function livePhoto(id) {
  await initFeed();
  if (pool) return (await pool.query('SELECT id, user_id AS "userId", caption FROM feed_photos WHERE id=$1 AND expires_at > NOW()', [id])).rows[0];
  return memoryPhotos().find(photo => photo.id === id && photo.expiresAt > Date.now());
}

const postWindows = new Map();
function feedRateLimit(req, res, next) {
  const now = Date.now();
  const recent = (postWindows.get(req.user.id) || []).filter(time => now - time < 60 * 60_000);
  if (recent.length >= 12) return res.status(429).json({ error: 'Muitas fotos seguidas. Aguarde um pouco antes de publicar outra.' });
  postWindows.set(req.user.id, [...recent, now]);
  return next();
}

const handle = fn => async (req, res, next) => {
  try {
    return await fn(req, res);
  } catch (error) {
    return next(error);
  }
};

export function registerFeedRoutes(app, requireAuth) {
  app.get('/api/v1/feed', requireAuth, handle(async (req, res) => {
    await purgeExpiredPhotos().catch(error => console.error('limpeza do feed', error));
    const before = clean(req.query.antes, 40);
    return res.json(await listPhotos(req.user.id, { before: before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : '' }));
  }));

  // Já ganhou o XP da foto de hoje? (para o aviso no formulário)
  app.get('/api/v1/feed/hoje', requireAuth, handle(async (req, res) => {
    const today = todayInBrazil();
    const used = pool
      ? (await pool.query("SELECT 1 FROM xp_events WHERE user_id=$1 AND kind='feed-diario' AND ref=$2", [req.user.id, today]).catch(() => ({ rowCount: 0 }))).rowCount > 0
      : (memory.xpEvents || []).some(item => item.userId === req.user.id && item.kind === 'feed-diario' && item.ref === today);
    return res.json({ date: today, xpAvailable: !used });
  }));

  app.post('/api/v1/feed', express.json({ limit: '1mb' }), requireAuth, feedRateLimit, handle(async (req, res) => {
    const mime = clean(req.body?.mime, 20).toLowerCase();
    const data = Buffer.from(typeof req.body?.data === 'string' ? req.body.data : '', 'base64');
    if (!photoTypes.has(mime) || !data.length || !imageMatches(mime, data)) return res.status(400).json({ error: 'Use uma foto JPG, PNG ou WEBP.' });
    if (data.length > feedPhotoMaxBytes) return res.status(413).json({ error: 'A foto ficou grande demais. Tente outra imagem.' });
    const now = Date.now();
    const photo = {
      id: randomUUID(), userId: req.user.id, mime, caption: clean(req.body?.caption, 300).replace(/\n{3,}/g, '\n\n'),
      inspired: req.body?.inspired === true, inspiration: req.body?.inspired === true ? clean(req.body?.inspiration, 200) : '',
      width: size(req.body?.width), height: size(req.body?.height), expiresAt: now + photoLifetimeMs
    };
    await initFeed();
    if (pool) {
      await pool.query('INSERT INTO feed_photos (id,user_id,mime,data,width,height,caption,inspired,inspiration,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
        [photo.id, photo.userId, mime, data, photo.width, photo.height, photo.caption, photo.inspired, photo.inspiration, new Date(photo.expiresAt)]);
    } else memoryPhotos().push({ ...photo, data, createdAt: now });
    // O XP vale para o dia (horário de Brasília), não para a foto: uma vez por dia, mesmo apagando e publicando de novo.
    const xpAwarded = (await awardXp(req.user.id, 'feed-diario', todayInBrazil(), { text: 'Foto do dia no Feed dos Migles' })) ? 200 : 0;
    const [created] = await listPhotos(req.user.id, { id: photo.id });
    return res.status(201).json({ ...created, xpAwarded });
  }));

  // Público para funcionar em <img>; o id é um UUID e a foto já é compartilhada com toda a comunidade.
  app.get('/api/v1/feed/:id/foto', handle(async (req, res) => {
    await initFeed();
    const id = clean(req.params.id, 64);
    const photo = pool
      ? (await pool.query('SELECT mime, data FROM feed_photos WHERE id=$1 AND expires_at > NOW()', [id])).rows[0]
      : memoryPhotos().find(item => item.id === id && item.expiresAt > Date.now());
    if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });
    res.set('Content-Type', photo.mime);
    // Cache curto e privado: a foto some em 24 h e não deve ficar guardada em servidores intermediários.
    res.set('Cache-Control', 'private, max-age=3600');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(photo.data);
  }));

  app.delete('/api/v1/feed/:id', requireAuth, handle(async (req, res) => {
    await initFeed();
    let removed;
    if (pool) removed = (await pool.query('DELETE FROM feed_photos WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
    else {
      const index = memoryPhotos().findIndex(item => item.id === req.params.id && item.userId === req.user.id);
      if (index >= 0) {
        memoryPhotos().splice(index, 1);
        memory.feedReactions = memoryReactions().filter(item => item.photoId !== req.params.id);
        memory.feedComments = memoryComments().filter(item => item.photoId !== req.params.id);
      }
      removed = index >= 0;
    }
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem publicou pode apagar a foto.' });
  }));

  // Curtir (❤️) e reagir: liga e desliga; uma de cada emoji por pessoa.
  app.post('/api/v1/feed/:id/reactions', requireAuth, handle(async (req, res) => {
    const emoji = String(req.body?.emoji || '');
    if (!feedEmojis.includes(emoji)) return res.status(400).json({ error: 'Reação inválida.' });
    const photo = await livePhoto(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Esta foto já expirou.' });
    let added;
    if (pool) {
      const removed = await pool.query('DELETE FROM feed_reactions WHERE photo_id=$1 AND user_id=$2 AND emoji=$3', [req.params.id, req.user.id, emoji]);
      added = !removed.rowCount;
      if (added) await pool.query('INSERT INTO feed_reactions (photo_id,user_id,emoji) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [req.params.id, req.user.id, emoji]);
    } else {
      const list = memoryReactions();
      const index = list.findIndex(item => item.photoId === req.params.id && item.userId === req.user.id && item.emoji === emoji);
      added = index < 0;
      if (added) list.push({ photoId: req.params.id, userId: req.user.id, emoji });
      else list.splice(index, 1);
    }
    if (added && photo.userId !== req.user.id) await notify(photo.userId, { kind: 'comunidade', key: `feed-reacao:${req.params.id}:${req.user.id}:${emoji}`, title: `${publicName(req.user.name)} ${emoji === '❤️' ? 'curtiu' : `reagiu ${emoji} a`} sua foto`, body: photo.caption || 'Feed dos Migles', link: { page: 'migles' } }).catch(() => {});
    const [item] = await listPhotos(req.user.id, { id: req.params.id });
    return res.json(item);
  }));

  app.post('/api/v1/feed/:id/comments', requireAuth, handle(async (req, res) => {
    const body = clean(req.body?.body, 500);
    if (!body) return res.status(400).json({ error: 'Escreva o comentário.' });
    const photo = await livePhoto(req.params.id);
    if (!photo) return res.status(404).json({ error: 'Esta foto já expirou.' });
    const id = randomUUID();
    if (pool) await pool.query('INSERT INTO feed_comments (id,photo_id,user_id,body) VALUES ($1,$2,$3,$4)', [id, req.params.id, req.user.id, body]);
    else memoryComments().push({ id, photoId: req.params.id, userId: req.user.id, body, createdAt: Date.now() });
    if (photo.userId !== req.user.id) await notify(photo.userId, { kind: 'comunidade', key: `feed-comentario:${id}`, title: `${publicName(req.user.name)} comentou sua foto`, body: body.slice(0, 120), link: { page: 'migles' } }).catch(() => {});
    const [item] = await listPhotos(req.user.id, { id: req.params.id });
    return res.status(201).json(item);
  }));

  app.delete('/api/v1/feed/comments/:id', requireAuth, handle(async (req, res) => {
    await initFeed();
    let removed;
    if (pool) removed = (await pool.query('DELETE FROM feed_comments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
    else {
      const before = memoryComments().length;
      memory.feedComments = memoryComments().filter(item => !(item.id === req.params.id && item.userId === req.user.id));
      removed = before - memory.feedComments.length;
    }
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem comentou pode apagar.' });
  }));
}
