import express from 'express';
import { randomUUID } from 'node:crypto';
import { initStore, memory, pool } from './store.js';

// Foto de perfil e quadro global de dúvidas.
// A foto fica numa tabela própria para não pesar a consulta de sessão (SELECT u.*), que roda em toda requisição.
// No quadro, todos os usuários autenticados veem as mesmas publicações; de cada autor só sai o nome público
// (primeiro nome e inicial do sobrenome) e a versão da foto. E-mail e demais dados da conta nunca são lidos aqui.

export const avatarMaxBytes = 400 * 1024;
const avatarTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Novas categorias entram sempre no fim, para não mudar as publicações que já existem.
export const postCategories = ['Dúvida', 'Ideia ou sugestão', 'Erro encontrado', 'Atualização', 'Comentário geral', 'Material', 'Dica de estudo'];

let ready;
function initSocial() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_avatars (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        mime TEXT NOT NULL, data BYTEA NOT NULL, updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS community_posts (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), edited BOOLEAN DEFAULT FALSE);
      CREATE INDEX IF NOT EXISTS community_posts_created_idx ON community_posts(created_at DESC);
      CREATE TABLE IF NOT EXISTS community_comments (
        id TEXT PRIMARY KEY, post_id TEXT NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), edited BOOLEAN DEFAULT FALSE);
      CREATE INDEX IF NOT EXISTS community_comments_post_idx ON community_comments(post_id)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const oneLine = (value, max) => clean(value, max).replace(/\s+/g, ' ');

export function publicName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Estudante';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

// ---------- Foto de perfil ----------

async function saveAvatar(userId, mime, data) {
  await initSocial();
  const version = Date.now().toString(36);
  if (pool) {
    await pool.query(`INSERT INTO user_avatars (user_id,mime,data,updated_at) VALUES ($1,$2,$3,NOW())
      ON CONFLICT (user_id) DO UPDATE SET mime=$2, data=$3, updated_at=NOW()`, [userId, mime, data]);
    await pool.query('UPDATE users SET avatar_version=$2 WHERE id=$1', [userId, version]);
  } else {
    (memory.avatars ||= new Map()).set(userId, { mime, data });
    const user = memory.users.find(item => item.id === userId);
    if (user) user.avatar_version = version;
  }
  return version;
}

async function removeAvatar(userId) {
  await initSocial();
  if (pool) {
    await pool.query('DELETE FROM user_avatars WHERE user_id=$1', [userId]);
    await pool.query("UPDATE users SET avatar_version='' WHERE id=$1", [userId]);
  } else {
    memory.avatars?.delete(userId);
    const user = memory.users.find(item => item.id === userId);
    if (user) user.avatar_version = '';
  }
}

async function readAvatar(userId) {
  await initSocial();
  if (pool) return (await pool.query('SELECT mime, data FROM user_avatars WHERE user_id=$1', [userId])).rows[0];
  return memory.avatars?.get(userId);
}

// Confere a assinatura do arquivo, não só o tipo declarado.
function imageMatches(mime, data) {
  if (mime === 'image/jpeg') return data[0] === 0xff && data[1] === 0xd8;
  if (mime === 'image/png') return data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') return data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WEBP';
  return false;
}

// ---------- Quadro global ----------

const postWindows = new Map();
function socialRateLimit(req, res, next) {
  const now = Date.now();
  const recent = (postWindows.get(req.user.id) || []).filter(time => now - time < 10 * 60_000);
  if (recent.length >= 20) return res.status(429).json({ error: 'Muitas publicações seguidas. Aguarde alguns minutos.' });
  postWindows.set(req.user.id, [...recent, now]);
  return next();
}

const memoryPosts = () => (memory.posts ||= []);
const memoryComments = () => (memory.comments ||= []);
const memoryAuthor = id => memory.users.find(user => user.id === id) || {};

const author = row => ({ id: row.userId, name: publicName(row.authorName), avatarVersion: row.avatarVersion || '' });
const publicPost = (row, viewerId) => ({
  id: row.id, category: row.category, title: row.title, body: row.body, edited: Boolean(row.edited),
  createdAt: new Date(row.createdAt).toISOString(), commentCount: Number(row.commentCount || 0),
  author: author(row), mine: row.userId === viewerId
});
const publicComment = (row, viewerId) => ({
  id: row.id, postId: row.postId, body: row.body, edited: Boolean(row.edited),
  createdAt: new Date(row.createdAt).toISOString(), author: author(row), mine: row.userId === viewerId
});

const postSelect = `SELECT p.id, p.user_id AS "userId", p.category, p.title, p.body, p.edited, p.created_at AS "createdAt",
  u.name AS "authorName", u.avatar_version AS "avatarVersion",
  (SELECT COUNT(*) FROM community_comments c WHERE c.post_id=p.id) AS "commentCount"
  FROM community_posts p JOIN users u ON u.id=p.user_id`;

async function listPosts(viewerId, { category, q }) {
  await initSocial();
  if (pool) {
    const where = [];
    const values = [];
    if (category) {
      values.push(category);
      where.push(`p.category=$${values.length}`);
    }
    if (q) {
      values.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
      where.push(`(p.title ILIKE $${values.length} OR p.body ILIKE $${values.length})`);
    }
    const rows = (await pool.query(`${postSelect} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.created_at DESC LIMIT 100`, values)).rows;
    return rows.map(row => publicPost(row, viewerId));
  }
  const term = (q || '').toLowerCase();
  return memoryPosts()
    .filter(post => (!category || post.category === category) && (!term || `${post.title} ${post.body}`.toLowerCase().includes(term)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 100)
    .map(post => publicPost({ ...post, authorName: memoryAuthor(post.userId).name, avatarVersion: memoryAuthor(post.userId).avatar_version, commentCount: memoryComments().filter(c => c.postId === post.id).length }, viewerId));
}

async function getPost(viewerId, id) {
  await initSocial();
  if (pool) {
    const row = (await pool.query(`${postSelect} WHERE p.id=$1`, [id])).rows[0];
    if (!row) return null;
    const comments = (await pool.query(`SELECT c.id, c.post_id AS "postId", c.user_id AS "userId", c.body, c.edited, c.created_at AS "createdAt",
      u.name AS "authorName", u.avatar_version AS "avatarVersion"
      FROM community_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 ORDER BY c.created_at ASC LIMIT 300`, [id])).rows;
    return { ...publicPost(row, viewerId), comments: comments.map(comment => publicComment(comment, viewerId)) };
  }
  const post = memoryPosts().find(item => item.id === id);
  if (!post) return null;
  const decorate = row => ({ ...row, authorName: memoryAuthor(row.userId).name, avatarVersion: memoryAuthor(row.userId).avatar_version });
  const comments = memoryComments().filter(comment => comment.postId === id).sort((a, b) => a.createdAt - b.createdAt);
  return { ...publicPost({ ...decorate(post), commentCount: comments.length }, viewerId), comments: comments.map(comment => publicComment(decorate(comment), viewerId)) };
}

function postInput(body) {
  const category = oneLine(body?.category, 40);
  const title = oneLine(body?.title, 140);
  const text = clean(body?.body, 4000);
  if (!postCategories.includes(category)) return { error: 'Escolha uma categoria.' };
  if (title.length < 3) return { error: 'Escreva um título com pelo menos 3 letras.' };
  return { post: { category, title, body: text } };
}

export function registerSocialRoutes(app, requireAuth) {
  app.put('/api/v1/me/avatar', express.json({ limit: '700kb' }), requireAuth, async (req, res, next) => {
    try {
      const mime = oneLine(req.body?.mime, 20).toLowerCase();
      const data = Buffer.from(typeof req.body?.data === 'string' ? req.body.data : '', 'base64');
      if (!avatarTypes.has(mime) || !data.length || !imageMatches(mime, data)) return res.status(400).json({ error: 'Use uma imagem JPG, PNG ou WEBP.' });
      if (data.length > avatarMaxBytes) return res.status(413).json({ error: 'A foto precisa ter até 400 KB.' });
      const avatarVersion = await saveAvatar(req.user.id, mime, data);
      return res.json({ ...req.user, avatarVersion });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/v1/me/avatar', requireAuth, async (req, res, next) => {
    try {
      await removeAvatar(req.user.id);
      return res.json({ ...req.user, avatarVersion: '' });
    } catch (error) {
      return next(error);
    }
  });

  // Público para funcionar em <img>; o id é um UUID e a foto não é dado sensível. A versão na URL invalida o cache.
  app.get('/api/v1/avatars/:userId', async (req, res, next) => {
    try {
      const avatar = await readAvatar(oneLine(req.params.userId, 64));
      if (!avatar) return res.status(404).json({ error: 'Sem foto.' });
      res.set('Content-Type', avatar.mime);
      res.set('Cache-Control', 'public, max-age=604800, immutable');
      res.set('X-Content-Type-Options', 'nosniff');
      return res.send(avatar.data);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/community/posts', requireAuth, async (req, res, next) => {
    try {
      const category = postCategories.includes(req.query.category) ? req.query.category : '';
      return res.json(await listPosts(req.user.id, { category, q: oneLine(req.query.q, 80) }));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/community/posts/:id', requireAuth, async (req, res, next) => {
    try {
      const post = await getPost(req.user.id, req.params.id);
      return post ? res.json(post) : res.status(404).json({ error: 'Publicação não encontrada.' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/community/posts', requireAuth, socialRateLimit, async (req, res, next) => {
    try {
      const { post, error } = postInput(req.body);
      if (error) return res.status(400).json({ error });
      await initSocial();
      const id = randomUUID();
      if (pool) await pool.query('INSERT INTO community_posts (id,user_id,category,title,body) VALUES ($1,$2,$3,$4,$5)', [id, req.user.id, post.category, post.title, post.body]);
      else memoryPosts().push({ id, userId: req.user.id, ...post, edited: false, createdAt: Date.now() });
      return res.status(201).json(await getPost(req.user.id, id));
    } catch (error) {
      return next(error);
    }
  });

  // Editar e excluir: a condição de dono fica no próprio WHERE, então não há como alterar a publicação de outra pessoa.
  app.patch('/api/v1/community/posts/:id', requireAuth, async (req, res, next) => {
    try {
      const { post, error } = postInput(req.body);
      if (error) return res.status(400).json({ error });
      await initSocial();
      let changed;
      if (pool) changed = (await pool.query('UPDATE community_posts SET category=$3,title=$4,body=$5,edited=TRUE,updated_at=NOW() WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id, post.category, post.title, post.body])).rowCount;
      else {
        const item = memoryPosts().find(entry => entry.id === req.params.id && entry.userId === req.user.id);
        if (item) Object.assign(item, post, { edited: true });
        changed = Boolean(item);
      }
      return changed ? res.json(await getPost(req.user.id, req.params.id)) : res.status(404).json({ error: 'Só quem publicou pode editar.' });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/v1/community/posts/:id', requireAuth, async (req, res, next) => {
    try {
      await initSocial();
      let removed;
      if (pool) removed = (await pool.query('DELETE FROM community_posts WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
      else {
        const index = memoryPosts().findIndex(entry => entry.id === req.params.id && entry.userId === req.user.id);
        if (index >= 0) {
          memoryPosts().splice(index, 1);
          memory.comments = memoryComments().filter(comment => comment.postId !== req.params.id);
        }
        removed = index >= 0;
      }
      return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem publicou pode excluir.' });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/community/posts/:id/comments', requireAuth, socialRateLimit, async (req, res, next) => {
    try {
      const body = clean(req.body?.body, 2000);
      if (!body) return res.status(400).json({ error: 'Escreva o comentário.' });
      await initSocial();
      const exists = pool ? (await pool.query('SELECT 1 FROM community_posts WHERE id=$1', [req.params.id])).rowCount : memoryPosts().some(post => post.id === req.params.id);
      if (!exists) return res.status(404).json({ error: 'Publicação não encontrada.' });
      const id = randomUUID();
      if (pool) await pool.query('INSERT INTO community_comments (id,post_id,user_id,body) VALUES ($1,$2,$3,$4)', [id, req.params.id, req.user.id, body]);
      else memoryComments().push({ id, postId: req.params.id, userId: req.user.id, body, edited: false, createdAt: Date.now() });
      return res.status(201).json(await getPost(req.user.id, req.params.id));
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/v1/community/comments/:id', requireAuth, async (req, res, next) => {
    try {
      const body = clean(req.body?.body, 2000);
      if (!body) return res.status(400).json({ error: 'Escreva o comentário.' });
      await initSocial();
      let postId;
      if (pool) postId = (await pool.query('UPDATE community_comments SET body=$3,edited=TRUE,updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING post_id', [req.params.id, req.user.id, body])).rows[0]?.post_id;
      else {
        const item = memoryComments().find(entry => entry.id === req.params.id && entry.userId === req.user.id);
        if (item) Object.assign(item, { body, edited: true });
        postId = item?.postId;
      }
      return postId ? res.json(await getPost(req.user.id, postId)) : res.status(404).json({ error: 'Só quem comentou pode editar.' });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/v1/community/comments/:id', requireAuth, async (req, res, next) => {
    try {
      await initSocial();
      let removed;
      if (pool) removed = (await pool.query('DELETE FROM community_comments WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
      else {
        const index = memoryComments().findIndex(entry => entry.id === req.params.id && entry.userId === req.user.id);
        if (index >= 0) memoryComments().splice(index, 1);
        removed = index >= 0;
      }
      return removed ? res.status(204).end() : res.status(404).json({ error: 'Só quem comentou pode excluir.' });
    } catch (error) {
      return next(error);
    }
  });
}
