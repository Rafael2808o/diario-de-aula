import express from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { initEntities } from './entities.js';
import { memory, pool } from './store.js';

// Arquivos dos materiais ficam no próprio PostgreSQL (bytea), ligados a um material da mesma conta.
// O limite por arquivo cabe no corpo aceito pelo proxy da Vercel; a cota por conta protege o banco gratuito.
export const maxFileBytes = 3 * 1024 * 1024;
const quotaBytes = 60 * 1024 * 1024;
const allowedTypes = /^(application\/pdf|image\/(png|jpe?g|webp|heic|heif|gif)|audio\/[\w.+-]+|text\/plain|application\/vnd\.openxmlformats-officedocument\.[\w.+-]+|application\/vnd\.ms-(powerpoint|excel)|application\/msword)$/;

let ready;
function initFiles() {
  ready ||= (async () => {
    await initEntities();
    if (!pool) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS study_files (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      material_id TEXT NOT NULL REFERENCES study_materials(id) ON DELETE CASCADE,
      name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, data BYTEA NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS study_files_user_idx ON study_files(user_id);
      CREATE TABLE IF NOT EXISTS file_tickets (
        ticket TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        file_id TEXT NOT NULL REFERENCES study_files(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const memoryFiles = () => (memory.files ||= []);
const publicFile = ({ id, materialId, name, mime, size }) => ({ id, materialId, name, mime, size });

async function usedBytes(userId) {
  if (pool) return Number((await pool.query('SELECT COALESCE(SUM(size),0) AS total FROM study_files WHERE user_id=$1', [userId])).rows[0].total);
  return memoryFiles().filter(file => file.userId === userId).reduce((sum, file) => sum + file.size, 0);
}

// Links de download de uso único e curta duração, para abrir arquivos fora do app (navegador, leitor de PDF)
// sem expor o token da sessão na URL.
// Ficam no banco porque, em funções serverless, quem cria e quem usa o link podem ser instâncias diferentes.
const memoryTickets = new Map();
const ticketLifetime = 2 * 60 * 1000;

async function createTicket(userId, fileId) {
  const ticket = randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + ticketLifetime);
  if (pool) {
    await pool.query('DELETE FROM file_tickets WHERE expires_at < NOW()');
    await pool.query('INSERT INTO file_tickets (ticket,user_id,file_id,expires_at) VALUES ($1,$2,$3,$4)', [ticket, userId, fileId, expiresAt]);
  } else {
    for (const [key, value] of memoryTickets) if (value.expiresAt < Date.now()) memoryTickets.delete(key);
    memoryTickets.set(ticket, { userId, fileId, expiresAt: expiresAt.getTime() });
  }
  return ticket;
}

// Uso único: o link é apagado na primeira leitura.
async function useTicket(ticket) {
  if (pool) {
    const row = (await pool.query('DELETE FROM file_tickets WHERE ticket=$1 RETURNING user_id AS "userId", file_id AS "fileId", expires_at AS "expiresAt"', [ticket])).rows[0];
    return row && new Date(row.expiresAt) > new Date() ? row : null;
  }
  const value = memoryTickets.get(ticket);
  memoryTickets.delete(ticket);
  return value && value.expiresAt > Date.now() ? value : null;
}

async function readFile(userId, id) {
  if (pool) return (await pool.query('SELECT name, mime, data FROM study_files WHERE id=$1 AND user_id=$2', [id, userId])).rows[0];
  return memoryFiles().find(item => item.id === id && item.userId === userId);
}

function sendFile(res, file) {
  res.set('Content-Type', file.mime);
  res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.send(file.data);
}

export function registerFileRoutes(app, requireAuth) {
  app.post('/api/v1/files/:id/ticket', requireAuth, async (req, res, next) => {
    try {
      await initFiles();
      if (!(await readFile(req.user.id, req.params.id))) return res.status(404).json({ error: 'Arquivo não encontrado.' });
      const ticket = await createTicket(req.user.id, req.params.id);
      return res.status(201).json({ ticket, expiresInSeconds: ticketLifetime / 1000 });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/files/download/:ticket', async (req, res, next) => {
    try {
      await initFiles();
      const ticket = /^[0-9a-f]{48}$/.test(req.params.ticket) ? await useTicket(req.params.ticket) : null;
      if (!ticket) return res.status(410).type('text/plain; charset=utf-8').send('Este link expirou. Volte ao Lúmina e abra o arquivo de novo.');
      const file = await readFile(ticket.userId, ticket.fileId);
      return file ? sendFile(res, file) : res.status(404).type('text/plain; charset=utf-8').send('Arquivo não encontrado.');
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/files', requireAuth, async (req, res, next) => {
    try {
      await initFiles();
      if (pool) {
        const rows = (await pool.query('SELECT id, material_id AS "materialId", name, mime, size FROM study_files WHERE user_id=$1 ORDER BY created_at DESC', [req.user.id])).rows;
        return res.json(rows);
      }
      return res.json(memoryFiles().filter(file => file.userId === req.user.id).map(publicFile));
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/files', express.json({ limit: '4400kb' }), requireAuth, async (req, res, next) => {
    try {
      await initFiles();
      const name = typeof req.body.name === 'string' ? req.body.name.trim().replace(/[\\/:*?"<>|]+/g, '-').slice(0, 160) : '';
      const mime = typeof req.body.mime === 'string' ? req.body.mime.toLowerCase().slice(0, 120) : '';
      const materialId = typeof req.body.materialId === 'string' ? req.body.materialId : '';
      if (!name || !materialId) return res.status(400).json({ error: 'Envie o arquivo junto de um material.' });
      if (!allowedTypes.test(mime)) return res.status(400).json({ error: 'Tipo de arquivo não aceito. Use PDF, imagem, áudio, texto ou documentos do Office.' });
      const buffer = Buffer.from(typeof req.body.data === 'string' ? req.body.data : '', 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'O arquivo está vazio.' });
      if (buffer.length > maxFileBytes) return res.status(413).json({ error: 'O arquivo precisa ter até 3 MB.' });
      if ((await usedBytes(req.user.id)) + buffer.length > quotaBytes) return res.status(413).json({ error: 'Seu espaço de arquivos (60 MB) está cheio. Exclua materiais antigos ou use links.' });
      const owns = pool
        ? (await pool.query('SELECT 1 FROM study_materials WHERE id=$1 AND user_id=$2', [materialId, req.user.id])).rowCount > 0
        : (memory.entities?.study_materials || []).some(row => row.id === materialId && row.userId === req.user.id);
      if (!owns) return res.status(404).json({ error: 'Material não encontrado.' });
      const file = { id: randomUUID(), materialId, name, mime, size: buffer.length };
      if (pool) await pool.query('INSERT INTO study_files (id,user_id,material_id,name,mime,size,data) VALUES ($1,$2,$3,$4,$5,$6,$7)', [file.id, req.user.id, materialId, name, mime, file.size, buffer]);
      else memoryFiles().push({ ...file, userId: req.user.id, data: buffer });
      return res.status(201).json(file);
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/files/:id', requireAuth, async (req, res, next) => {
    try {
      await initFiles();
      const file = await readFile(req.user.id, req.params.id);
      if (!file) return res.status(404).json({ error: 'Arquivo não encontrado.' });
      return sendFile(res, file);
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/v1/files/:id', requireAuth, async (req, res, next) => {
    try {
      await initFiles();
      if (pool) {
        const removed = (await pool.query('DELETE FROM study_files WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])).rowCount;
        return removed ? res.status(204).end() : res.status(404).json({ error: 'Arquivo não encontrado.' });
      }
      const before = memoryFiles().length;
      memory.files = memoryFiles().filter(item => !(item.id === req.params.id && item.userId === req.user.id));
      return memory.files.length < before ? res.status(204).end() : res.status(404).json({ error: 'Arquivo não encontrado.' });
    } catch (error) {
      return next(error);
    }
  });
}
