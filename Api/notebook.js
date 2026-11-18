import express from 'express';
import { randomUUID } from 'node:crypto';
import { notify } from './notifications.js';
import { imageMatches, publicName } from './social.js';
import { initStore, memory, pool } from './store.js';
import { initEntities } from './entities.js';
import { sanitizeHtml } from './richtext.js';

// Caderno da aula (versão 4.0): fotos dentro do resumo e compartilhamento com colegas.
// - Fotos: o aparelho reduz a imagem (até 650 KB); o HTML do caderno guarda só <img data-img="id">
//   (ver richtext.js) e o navegador busca o arquivo com o token. Só o dono da aula e quem recebeu o caderno abrem.
//   Fotos que saíram do texto há mais de 1 dia são apagadas no próximo envio daquela aula.
// - Compartilhar: o dono escolhe colegas; eles leem o caderno (sem editar) e deixam recados com figurinha.
//   Nada da aula além do caderno, do tema, da data e da disciplina é mostrado.

export const notebookImageMaxBytes = 680 * 1024;
const perUserBytes = 40 * 1024 * 1024;
const imageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
// Figurinhas gratuitas dos recados (as mesmas do painel do Caderno). A Loja da Madrugada poderá acrescentar outras.
export const freeStickers = ['lua', 'estrela', 'constelacao', 'gato', 'livro', 'pocao', 'vela', 'olho', 'cristal', 'importante', 'cai-na-prova', 'revisar', 'duvida', 'dominei', 'coracao'];
const maxShares = 30;

let ready;
export function initNotebook() {
  ready ||= (async () => {
    await initStore();
    await initEntities();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notebook_images (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        mime TEXT NOT NULL, data BYTEA NOT NULL, size INTEGER NOT NULL DEFAULT 0,
        width INTEGER NOT NULL DEFAULT 0, height INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS notebook_images_lesson_idx ON notebook_images(lesson_id);
      CREATE TABLE IF NOT EXISTS notebook_shares (
        lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (lesson_id, user_id));
      CREATE INDEX IF NOT EXISTS notebook_shares_user_idx ON notebook_shares(user_id);
      CREATE TABLE IF NOT EXISTS notebook_notes (
        id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        body TEXT NOT NULL DEFAULT '', sticker TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS notebook_notes_lesson_idx ON notebook_notes(lesson_id)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const mem = () => {
  memory.notebookImages ||= [];
  memory.notebookShares ||= [];
  memory.notebookNotes ||= [];
  return memory;
};
const memLessons = () => ((memory.entities ||= {}).lessons ||= []);
const memUser = id => memory.users.find(user => user.id === id) || {};
const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const size = value => Math.max(0, Math.min(10000, Number.parseInt(value, 10) || 0));
const iso = value => new Date(value || Date.now()).toISOString();
const author = (id, name, avatarVersion) => ({ id, name: publicName(name), avatarVersion: avatarVersion || '' });

// Aula com o dono e a disciplina (sem os outros campos do registro).
async function lessonInfo(id) {
  if (pool) {
    return (await pool.query(`SELECT l.id, l.user_id AS "ownerId", l.lesson_date AS date, l.start_time AS "startTime", l.theme, l.annotations,
      s.name AS "subjectName", s.color AS "subjectColor", u.name AS "ownerName", u.avatar_version AS "ownerAvatar"
      FROM lessons l JOIN users u ON u.id=l.user_id LEFT JOIN subjects s ON s.id=l.subject_id WHERE l.id=$1`, [id])).rows[0] || null;
  }
  const row = memLessons().find(item => item.id === id);
  if (!row) return null;
  const subject = memory.subjects.find(item => item.id === row.subjectId) || {};
  const owner = memUser(row.userId);
  return { id: row.id, ownerId: row.userId, date: row.date, startTime: row.startTime, theme: row.theme, annotations: row.annotations, subjectName: subject.name || '', subjectColor: subject.color || '', ownerName: owner.name, ownerAvatar: owner.avatar_version };
}

async function sharedWith(lessonId) {
  if (pool) return (await pool.query('SELECT user_id AS "userId" FROM notebook_shares WHERE lesson_id=$1', [lessonId])).rows.map(row => row.userId);
  return mem().notebookShares.filter(item => item.lessonId === lessonId).map(item => item.userId);
}

// Quem pode ler: o dono e as pessoas com quem o caderno foi compartilhado.
async function access(lessonId, userId) {
  await initNotebook();
  const lesson = await lessonInfo(lessonId);
  if (!lesson) return null;
  if (lesson.ownerId === userId) return { lesson, owner: true };
  return (await sharedWith(lessonId)).includes(userId) ? { lesson, owner: false } : null;
}

async function people(ids) {
  if (!ids.length) return [];
  const rows = pool
    ? (await pool.query('SELECT id, name, avatar_version AS "avatarVersion" FROM users WHERE id = ANY($1)', [ids])).rows
    : ids.map(memUser).filter(user => user.id).map(user => ({ id: user.id, name: user.name, avatarVersion: user.avatar_version }));
  return rows.map(row => author(row.id, row.name, row.avatarVersion));
}

async function notesOf(lessonId, viewerId, ownerId) {
  const rows = pool
    ? (await pool.query(`SELECT n.id, n.user_id AS "userId", n.body, n.sticker, n.created_at AS "createdAt", u.name, u.avatar_version AS "avatarVersion"
      FROM notebook_notes n JOIN users u ON u.id=n.user_id WHERE n.lesson_id=$1 ORDER BY n.created_at`, [lessonId])).rows
    : mem().notebookNotes.filter(item => item.lessonId === lessonId).map(item => ({ ...item, name: memUser(item.userId).name, avatarVersion: memUser(item.userId).avatar_version }));
  return rows.map(row => ({ id: row.id, body: row.body, sticker: row.sticker, createdAt: iso(row.createdAt), author: author(row.userId, row.name, row.avatarVersion), canDelete: row.userId === viewerId || ownerId === viewerId }));
}

// Apaga fotos da aula que não estão mais no texto há mais de 1 dia (o dono pode ter desfeito a remoção nesse meio-tempo).
async function pruneImages(lessonId, html) {
  const used = new Set([...String(html || '').matchAll(/data-img="([0-9a-f-]{36})"/g)].map(match => match[1]));
  const cutoff = Date.now() - 24 * 3600_000;
  if (pool) {
    await pool.query('DELETE FROM notebook_images WHERE lesson_id=$1 AND created_at < $2 AND NOT (id = ANY($3))', [lessonId, new Date(cutoff), [...used]]);
  } else memory.notebookImages = mem().notebookImages.filter(item => item.lessonId !== lessonId || item.createdAt >= cutoff || used.has(item.id));
}

export function registerNotebookRoutes(app, requireAuth) {
  const handle = action => async (req, res, next) => {
    try {
      await initNotebook();
      return await action(req, res);
    } catch (error) {
      return next(error);
    }
  };

  // ---------- Fotos no caderno ----------
  app.post('/api/v1/lessons/:id/imagens', express.json({ limit: '1mb' }), requireAuth, handle(async (req, res) => {
    const found = await access(req.params.id, req.user.id);
    if (!found?.owner) return res.status(404).json({ error: 'Aula não encontrada.' });
    const mime = clean(req.body?.mime, 20).toLowerCase();
    const data = Buffer.from(typeof req.body?.data === 'string' ? req.body.data : '', 'base64');
    if (!imageTypes.has(mime) || !data.length || !imageMatches(mime, data)) return res.status(400).json({ error: 'Use uma imagem JPG, PNG ou WEBP.' });
    if (data.length > notebookImageMaxBytes) return res.status(413).json({ error: 'A imagem ficou grande demais. Tente outra.' });
    const used = pool
      ? Number((await pool.query('SELECT COALESCE(SUM(size),0) AS total FROM notebook_images WHERE user_id=$1', [req.user.id])).rows[0].total)
      : mem().notebookImages.filter(item => item.userId === req.user.id).reduce((sum, item) => sum + item.size, 0);
    if (used + data.length > perUserBytes) return res.status(413).json({ error: 'Seus cadernos já têm 40 MB de imagens. Tire fotos que não usa mais para liberar espaço.' });
    await pruneImages(found.lesson.id, found.lesson.annotations);
    const id = randomUUID();
    if (pool) {
      await pool.query('INSERT INTO notebook_images (id,user_id,lesson_id,mime,data,size,width,height) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, req.user.id, found.lesson.id, mime, data, data.length, size(req.body?.width), size(req.body?.height)]);
    } else mem().notebookImages.push({ id, userId: req.user.id, lessonId: found.lesson.id, mime, data, size: data.length, createdAt: Date.now() });
    return res.status(201).json({ id });
  }));

  app.get('/api/v1/imagens-caderno/:id', requireAuth, handle(async (req, res) => {
    const id = clean(req.params.id, 64);
    const image = pool
      ? (await pool.query('SELECT lesson_id AS "lessonId", mime, data FROM notebook_images WHERE id=$1', [id])).rows[0]
      : mem().notebookImages.find(item => item.id === id);
    if (!image || !(await access(image.lessonId, req.user.id))) return res.status(404).json({ error: 'Imagem não encontrada.' });
    res.set('Content-Type', image.mime);
    res.set('Cache-Control', 'private, max-age=86400');
    res.set('X-Content-Type-Options', 'nosniff');
    return res.send(image.data);
  }));

  // ---------- Compartilhar o caderno ----------
  app.get('/api/v1/lessons/:id/compartilhamento', requireAuth, handle(async (req, res) => {
    const found = await access(req.params.id, req.user.id);
    if (!found?.owner) return res.status(404).json({ error: 'Aula não encontrada.' });
    return res.json({ people: await people(await sharedWith(found.lesson.id)) });
  }));

  app.put('/api/v1/lessons/:id/compartilhamento', requireAuth, handle(async (req, res) => {
    const found = await access(req.params.id, req.user.id);
    if (!found?.owner) return res.status(404).json({ error: 'Aula não encontrada.' });
    const wanted = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(String))].filter(id => id !== req.user.id);
    if (wanted.length > maxShares) return res.status(400).json({ error: `Compartilhe com até ${maxShares} pessoas.` });
    const valid = (await people(wanted)).map(person => person.id);
    const before = await sharedWith(found.lesson.id);
    if (pool) {
      await pool.query('DELETE FROM notebook_shares WHERE lesson_id=$1 AND NOT (user_id = ANY($2))', [found.lesson.id, valid]);
      for (const userId of valid) await pool.query('INSERT INTO notebook_shares (lesson_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [found.lesson.id, userId]);
    } else {
      memory.notebookShares = mem().notebookShares.filter(item => item.lessonId !== found.lesson.id).concat(valid.map(userId => ({ lessonId: found.lesson.id, userId, createdAt: Date.now() })));
    }
    for (const userId of valid.filter(id => !before.includes(id))) {
      await notify(userId, {
        kind: 'caderno', key: `caderno:${found.lesson.id}:${userId}`,
        title: `${publicName(req.user.name)} compartilhou um caderno com você`,
        body: [found.lesson.subjectName, found.lesson.theme].filter(Boolean).join(' · ') || 'Caderno de aula',
        link: { page: 'caderno', params: { shared: found.lesson.id } }
      }).catch(() => {});
    }
    return res.json({ people: await people(valid) });
  }));

  // Cadernos que colegas compartilharam comigo.
  app.get('/api/v1/cadernos/compartilhados', requireAuth, handle(async (req, res) => {
    const ids = pool
      ? (await pool.query('SELECT lesson_id AS "lessonId" FROM notebook_shares WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [req.user.id])).rows.map(row => row.lessonId)
      : mem().notebookShares.filter(item => item.userId === req.user.id).map(item => item.lessonId);
    const list = [];
    for (const id of ids) {
      const lesson = await lessonInfo(id);
      if (lesson) list.push({ id, date: lesson.date, theme: lesson.theme || '', subjectName: lesson.subjectName || '', subjectColor: lesson.subjectColor || '', owner: author(lesson.ownerId, lesson.ownerName, lesson.ownerAvatar) });
    }
    return res.json(list);
  }));

  app.get('/api/v1/cadernos/:id', requireAuth, handle(async (req, res) => {
    const found = await access(req.params.id, req.user.id);
    if (!found) return res.status(404).json({ error: 'Caderno não encontrado ou não compartilhado com você.' });
    const { lesson } = found;
    return res.json({
      id: lesson.id, date: lesson.date, startTime: lesson.startTime || '', theme: lesson.theme || '', subjectName: lesson.subjectName || '', subjectColor: lesson.subjectColor || '',
      annotations: sanitizeHtml(lesson.annotations || ''), owner: author(lesson.ownerId, lesson.ownerName, lesson.ownerAvatar), mine: found.owner,
      notes: await notesOf(lesson.id, req.user.id, lesson.ownerId), stickers: freeStickers
    });
  }));

  app.post('/api/v1/cadernos/:id/recados', requireAuth, handle(async (req, res) => {
    const found = await access(req.params.id, req.user.id);
    if (!found) return res.status(404).json({ error: 'Caderno não encontrado ou não compartilhado com você.' });
    const body = clean(req.body?.body, 600);
    const sticker = freeStickers.includes(req.body?.sticker) ? req.body.sticker : '';
    if (!body && !sticker) return res.status(400).json({ error: 'Escreva um recado ou escolha uma figurinha.' });
    const id = randomUUID();
    if (pool) await pool.query('INSERT INTO notebook_notes (id,lesson_id,user_id,body,sticker) VALUES ($1,$2,$3,$4,$5)', [id, found.lesson.id, req.user.id, body, sticker]);
    else mem().notebookNotes.push({ id, lessonId: found.lesson.id, userId: req.user.id, body, sticker, createdAt: Date.now() });
    if (!found.owner) {
      await notify(found.lesson.ownerId, {
        kind: 'caderno', key: `caderno-recado:${id}`, title: `${publicName(req.user.name)} deixou um recado no seu caderno`,
        body: body.slice(0, 120) || 'Uma figurinha para você', link: { page: 'caderno', params: { lesson: found.lesson.id } }
      }).catch(() => {});
    }
    return res.status(201).json(await notesOf(found.lesson.id, req.user.id, found.lesson.ownerId));
  }));

  app.delete('/api/v1/cadernos/recados/:id', requireAuth, handle(async (req, res) => {
    const note = pool
      ? (await pool.query('SELECT id, lesson_id AS "lessonId", user_id AS "userId" FROM notebook_notes WHERE id=$1', [req.params.id])).rows[0]
      : mem().notebookNotes.find(item => item.id === req.params.id);
    const found = note && (await access(note.lessonId, req.user.id));
    if (!found || (note.userId !== req.user.id && !found.owner)) return res.status(404).json({ error: 'Recado não encontrado.' });
    if (pool) await pool.query('DELETE FROM notebook_notes WHERE id=$1', [note.id]);
    else memory.notebookNotes = mem().notebookNotes.filter(item => item.id !== note.id);
    return res.json(await notesOf(note.lessonId, req.user.id, found.lesson.ownerId));
  }));
}
