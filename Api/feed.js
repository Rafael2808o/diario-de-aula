import express from 'express';
import { randomUUID } from 'node:crypto';
import { imageMatches, publicName } from './social.js';
import { initStore, memory, pool } from './store.js';

// Feed dos Migles: fotos de estudo compartilhadas com toda a comunidade.
// O navegador reduz a foto antes de enviar (lado maior de até 1600 px), então cada uma fica em poucas centenas de KB.
// A imagem fica numa tabela própria e é servida por um endereço com UUID, como a foto de perfil.
// De cada autor sai só o nome público e a versão da foto de perfil; apagar só quem publicou.

export const feedPhotoMaxBytes = 700 * 1024;
const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const pageSize = 30;

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
      CREATE INDEX IF NOT EXISTS feed_photos_created_idx ON feed_photos(created_at DESC)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const size = value => Math.max(0, Math.min(10_000, Number.parseInt(value, 10) || 0));
const memoryPhotos = () => (memory.feedPhotos ||= []);
const memoryUser = id => memory.users.find(user => user.id === id) || {};

const publicPhoto = (row, viewerId) => ({
  id: row.id, caption: row.caption, inspired: Boolean(row.inspired), inspiration: row.inspiration || '',
  width: Number(row.width) || 0, height: Number(row.height) || 0,
  createdAt: new Date(row.createdAt).toISOString(),
  author: { id: row.userId, name: publicName(row.authorName), avatarVersion: row.avatarVersion || '' },
  mine: row.userId === viewerId
});

async function listPhotos(viewerId, before) {
  await initFeed();
  if (pool) {
    const values = [];
    let where = '';
    if (before) {
      values.push(before);
      where = 'WHERE f.created_at < $1';
    }
    const rows = (await pool.query(`SELECT f.id, f.user_id AS "userId", f.caption, f.inspired, f.inspiration, f.width, f.height, f.created_at AS "createdAt",
      u.name AS "authorName", u.avatar_version AS "avatarVersion"
      FROM feed_photos f JOIN users u ON u.id=f.user_id ${where} ORDER BY f.created_at DESC LIMIT ${pageSize}`, values)).rows;
    return rows.map(row => publicPhoto(row, viewerId));
  }
  const limit = before ? new Date(before).getTime() : Infinity;
  return memoryPhotos()
    .filter(photo => photo.createdAt < limit)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, pageSize)
    .map(photo => publicPhoto({ ...photo, authorName: memoryUser(photo.userId).name, avatarVersion: memoryUser(photo.userId).avatar_version }, viewerId));
}

const postWindows = new Map();
function feedRateLimit(req, res, next) {
  const now = Date.now();
  const recent = (postWindows.get(req.user.id) || []).filter(time => now - time < 60 * 60_000);
  if (recent.length >= 12) return res.status(429).json({ error: 'Muitas fotos seguidas. Aguarde um pouco antes de publicar outra.' });
  postWindows.set(req.user.id, [...recent, now]);
  return next();
}

export function registerFeedRoutes(app, requireAuth) {
  app.get('/api/v1/feed', requireAuth, async (req, res, next) => {
    try {
      const before = clean(req.query.antes, 40);
      return res.json(await listPhotos(req.user.id, before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : ''));
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/feed', express.json({ limit: '1mb' }), requireAuth, feedRateLimit, async (req, res, next) => {
    try {
      const mime = clean(req.body?.mime, 20).toLowerCase();
      const data = Buffer.from(typeof req.body?.data === 'string' ? req.body.data : '', 'base64');
      if (!photoTypes.has(mime) || !data.length || !imageMatches(mime, data)) return res.status(400).json({ error: 'Use uma foto JPG, PNG ou WEBP.' });
      if (data.length > feedPhotoMaxBytes) return res.status(413).json({ error: 'A foto ficou grande demais. Tente outra imagem.' });
      const photo = {
        id: randomUUID(), userId: req.user.id, mime, caption: clean(req.body?.caption, 300).replace(/\n{3,}/g, '\n\n'),
        inspired: req.body?.inspired === true, inspiration: req.body?.inspired === true ? clean(req.body?.inspiration, 200) : '',
        width: size(req.body?.width), height: size(req.body?.height)
      };
      await initFeed();
      if (pool) {
        await pool.query('INSERT INTO feed_photos (id,user_id,mime,data,width,height,caption,inspired,inspiration) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [photo.id, photo.userId, mime, data, photo.width, photo.height, photo.caption, photo.inspired, photo.inspiration]);
      } else memoryPhotos().push({ ...photo, data, createdAt: Date.now() });
      return res.status(201).json(publicPhoto({ ...photo, createdAt: Date.now(), authorName: req.user.name, avatarVersion: req.user.avatarVersion }, req.user.id));
    } catch (error) {
      return next(error);
    }
  });

  // Público para funcionar em <img>; o id é um UUID e a foto já é compartilhada com toda a comunidade.
  app.get('/api/v1/feed/:id/foto', async (req, res, next) => {
    try {
      await initFeed();
      const id = clean(req.params.id, 64);
      const photo = pool
        ? (await pool.query('SELECT mime, data FROM feed_photos WHERE id=$1', [id])).rows[0]
        : memoryPhotos().find(item => item.id === id);
      if (!photo) return res.status(404).json({ error: 'Foto não encontrada.' });
      res.set('Content-Type', photo.mime);
      res.set('Cache-Control', 'public, max-age=604800, immutable');
      res.set('X-Content-Type-Options', 'nosniff');
      return res.send(photo.data);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/v1/feed/:id', requireAuth, async (req, res, next) => {
    try {
      await initFeed();
      let removed;
      if (pool) removed = (await pool.query('DELETE FROM feed_photos WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
      else {
        const index = memoryPhotos().findIndex(item => item.id === req.params.id && item.userId === req.user.id);
        if (index >= 0) memoryPhotos().splice(index, 1);
        removed = index >= 0;
      }
      return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem publicou pode apagar a foto.' });
    } catch (error) {
      return next(error);
    }
  });
}
