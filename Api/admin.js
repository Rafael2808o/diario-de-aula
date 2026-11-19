import { randomUUID } from 'node:crypto';
import { initStore, memory, pool } from './store.js';
import { can, roleOf } from './roles.js';
import { setItemSettings, shopStats } from './shop.js';

// Painel de Administração (versão 4.1). Entra só quem já é admin (papel na tabela user_roles ou e-mail em ADMIN_EMAILS):
// usa a mesma sessão do Grimiau, sem login separado, e cada rota confere o papel no servidor.
// Tudo aqui é dado real. E-mail aparece só nestas rotas, nunca nas públicas.
// Suspender: a pessoa não entra nem usa a conta até ser reativada; nada é apagado. Toda ação fica no registro de auditoria.

export const severities = ['baixa', 'media', 'alta', 'critica'];
export const reportStatuses = ['aberto', 'em-andamento', 'resolvido', 'descartado'];
const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const text = (value, max) => String(value ?? '').replace(/\r/g, '').trim().slice(0, max);

let ready;
export function initAdmin() {
  ready ||= (async () => {
    await initStore();
    if (!pool) {
      memory.reports ||= [];
      memory.audit ||= [];
      return;
    }
    await pool.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_reason TEXT NOT NULL DEFAULT '';
      CREATE TABLE IF NOT EXISTS problem_reports (
        id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', page TEXT NOT NULL DEFAULT '', device TEXT NOT NULL DEFAULT '',
        severity TEXT NOT NULL DEFAULT 'media', status TEXT NOT NULL DEFAULT 'aberto', admin_note TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS problem_reports_status_idx ON problem_reports(status, created_at DESC);
      CREATE TABLE IF NOT EXISTS admin_audit (
        id TEXT PRIMARY KEY, admin_id TEXT, action TEXT NOT NULL, target TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW());`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

// Conferido em toda requisição autenticada. Guarda a resposta por 30 s para não pesar no banco.
const suspendedCache = new Map();
export async function isSuspended(userId) {
  const cached = suspendedCache.get(userId);
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  await initAdmin();
  const value = pool
    ? Boolean((await pool.query('SELECT suspended_at FROM users WHERE id=$1', [userId])).rows[0]?.suspended_at)
    : Boolean(memory.users.find(user => user.id === userId)?.suspended_at);
  suspendedCache.set(userId, { value, at: Date.now() });
  return value;
}

async function audit(adminId, action, target, detail = '') {
  if (pool) await pool.query('INSERT INTO admin_audit (id, admin_id, action, target, detail) VALUES ($1,$2,$3,$4,$5)', [randomUUID(), adminId, action, target, oneLine(detail, 300)]);
  else memory.audit.unshift({ id: randomUUID(), adminId, action, target, detail, createdAt: new Date().toISOString() });
}

const daysAgo = days => new Date(Date.now() - days * 86400000);

async function people() {
  if (pool) {
    return (await pool.query(`SELECT u.id, u.name, u.email, u.course, u.avatar_version AS "avatarVersion", u.created_at AS "createdAt",
        u.suspended_at AS "suspendedAt", u.suspended_reason AS "suspendedReason", r.role,
        GREATEST(p.last_seen_at, (SELECT max(expires_at) - interval '30 days' FROM sessions s WHERE s.user_id=u.id)) AS "lastSeenAt"
      FROM users u LEFT JOIN user_presence p ON p.user_id=u.id LEFT JOIN user_roles r ON r.user_id=u.id
      ORDER BY u.created_at DESC`)).rows;
  }
  return memory.users.map(user => ({
    id: user.id, name: user.name, email: user.email, course: user.course || '', avatarVersion: user.avatar_version || '',
    createdAt: user.created_at || null, suspendedAt: user.suspended_at || null, suspendedReason: user.suspended_reason || '',
    role: memory.roles?.get(user.id) || null,
    lastSeenAt: memory.presence?.get(user.id)?.lastSeenAt ? new Date(memory.presence.get(user.id).lastSeenAt) : null,
  }));
}

const statusOf = (person, since) => person.suspendedAt ? 'suspensa' : person.lastSeenAt && new Date(person.lastSeenAt) >= since ? 'ativa' : 'inativa';
const personOut = (person, since) => ({
  id: person.id, name: person.name, email: person.email, course: person.course || '', avatarVersion: person.avatarVersion || '',
  createdAt: person.createdAt, lastSeenAt: person.lastSeenAt, role: person.role || '', status: statusOf(person, since),
  suspendedReason: person.suspendedReason || '',
});

async function reports({ status = '' } = {}) {
  if (pool) {
    return (await pool.query(`SELECT r.id, r.title, r.description, r.page, r.device, r.severity, r.status, r.admin_note AS "adminNote",
        r.created_at AS "createdAt", r.updated_at AS "updatedAt", u.name AS "author"
      FROM problem_reports r LEFT JOIN users u ON u.id=r.user_id
      WHERE ($1 = '' OR r.status = $1) ORDER BY (r.status IN ('aberto','em-andamento')) DESC, r.created_at DESC LIMIT 200`, [status])).rows;
  }
  return memory.reports.filter(item => !status || item.status === status)
    .map(item => ({ ...item, author: memory.users.find(user => user.id === item.userId)?.name || '' }));
}

export function registerAdminRoutes(app, requireAuth) {
  // Qualquer pessoa logada pode relatar um problema; só a administração lê.
  app.post('/api/v1/relatos', requireAuth, async (req, res, next) => {
    try {
      await initAdmin();
      const title = oneLine(req.body?.title, 120);
      if (title.length < 4) return res.status(400).json({ error: 'Conte em poucas palavras o que aconteceu.' });
      const row = {
        id: randomUUID(), userId: req.user.id, title, description: text(req.body?.description, 2000),
        page: oneLine(req.body?.page, 80), device: oneLine(req.body?.device, 160), severity: 'media', status: 'aberto', adminNote: '',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      if (pool) {
        await pool.query('INSERT INTO problem_reports (id,user_id,title,description,page,device) VALUES ($1,$2,$3,$4,$5,$6)',
          [row.id, row.userId, row.title, row.description, row.page, row.device]);
      } else memory.reports.unshift(row);
      return res.status(201).json({ id: row.id });
    } catch (error) {
      return next(error);
    }
  });

  const requireAdmin = async (req, res, next) => {
    try {
      if (!can.grant(await roleOf(req.user))) return res.status(403).json({ error: 'Área restrita à administração do Grimiau.' });
      await initAdmin();
      return next();
    } catch (error) {
      return next(error);
    }
  };

  app.get('/api/v1/admin/resumo', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const since = daysAgo(30);
      const all = await people();
      const open = (await reports()).filter(item => item.status === 'aberto' || item.status === 'em-andamento');
      const items = await shopStats();
      return res.json({
        people: all.length,
        active: all.filter(person => statusOf(person, since) === 'ativa').length,
        inactive: all.filter(person => statusOf(person, since) === 'inativa').length,
        suspended: all.filter(person => person.suspendedAt).length,
        shop: { published: items.filter(item => item.published).length, total: items.length, sold: items.reduce((sum, item) => sum + item.sold, 0) },
        reports: { open: open.length, bySeverity: Object.fromEntries(severities.map(level => [level, open.filter(item => item.severity === level).length])) },
        recent: all.filter(person => person.lastSeenAt).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt)).slice(0, 7).map(person => personOut(person, since)),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/admin/usuarios', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const since = daysAgo(30);
      const q = oneLine(req.query.q, 60).toLowerCase();
      const status = oneLine(req.query.status, 20);
      const list = (await people()).map(person => personOut(person, since))
        .filter(person => !q || person.name.toLowerCase().includes(q) || String(person.email).toLowerCase().includes(q))
        .filter(person => !status || person.status === status);
      return res.json(list);
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/admin/usuarios/:id/suspensao', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const suspend = Boolean(req.body?.suspend);
      const reason = oneLine(req.body?.reason, 200);
      if (req.params.id === req.user.id) return res.status(400).json({ error: 'Você não pode suspender a própria conta.' });
      const target = (await people()).find(person => person.id === req.params.id);
      if (!target) return res.status(404).json({ error: 'Pessoa não encontrada.' });
      if (suspend && (await roleOf({ id: target.id, email: target.email })) === 'admin') return res.status(400).json({ error: 'Tire o papel de administração antes de suspender esta conta.' });
      if (suspend && !reason) return res.status(400).json({ error: 'Escreva o motivo da suspensão.' });
      if (pool) {
        await pool.query('UPDATE users SET suspended_at=$2, suspended_reason=$3 WHERE id=$1', [target.id, suspend ? new Date() : null, suspend ? reason : '']);
        if (suspend) await pool.query('DELETE FROM sessions WHERE user_id=$1', [target.id]);
      } else {
        const user = memory.users.find(item => item.id === target.id);
        Object.assign(user, { suspended_at: suspend ? new Date().toISOString() : null, suspended_reason: suspend ? reason : '' });
        if (suspend) for (const [hash, session] of memory.sessions) if (session.userId === target.id) memory.sessions.delete(hash);
      }
      suspendedCache.delete(target.id);
      await audit(req.user.id, suspend ? 'suspendeu conta' : 'reativou conta', target.name, reason);
      return res.json({ id: target.id, status: suspend ? 'suspensa' : 'reativada' });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/admin/loja', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      return res.json(await shopStats());
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/v1/admin/loja/:itemId', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const changes = {};
      if (req.body?.price !== undefined) {
        const price = Number(req.body.price);
        if (!Number.isInteger(price) || price < 50 || price > 20000) return res.status(400).json({ error: 'Use um preço entre 50 e 20.000.' });
        changes.price = price;
      }
      if (req.body?.published !== undefined) changes.published = Boolean(req.body.published);
      if (!(await setItemSettings(req.params.itemId, changes, req.user.id))) return res.status(404).json({ error: 'Item não encontrado.' });
      await audit(req.user.id, 'alterou item da loja', req.params.itemId, JSON.stringify(changes));
      return res.json((await shopStats()).find(item => item.id === req.params.itemId));
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/admin/relatos', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      return res.json(await reports({ status: reportStatuses.includes(req.query.status) ? req.query.status : '' }));
    } catch (error) {
      return next(error);
    }
  });

  app.patch('/api/v1/admin/relatos/:id', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const severity = req.body?.severity;
      const status = req.body?.status;
      if (severity !== undefined && !severities.includes(severity)) return res.status(400).json({ error: 'Gravidade inválida.' });
      if (status !== undefined && !reportStatuses.includes(status)) return res.status(400).json({ error: 'Situação inválida.' });
      const note = req.body?.adminNote === undefined ? undefined : text(req.body.adminNote, 1000);
      let found;
      if (pool) {
        found = (await pool.query(`UPDATE problem_reports SET severity=COALESCE($2,severity), status=COALESCE($3,status), admin_note=COALESCE($4,admin_note), updated_at=NOW()
          WHERE id=$1 RETURNING id, title`, [req.params.id, severity ?? null, status ?? null, note ?? null])).rows[0];
      } else {
        found = memory.reports.find(item => item.id === req.params.id);
        if (found) Object.assign(found, severity ? { severity } : {}, status ? { status } : {}, note !== undefined ? { adminNote: note } : {}, { updatedAt: new Date().toISOString() });
      }
      if (!found) return res.status(404).json({ error: 'Relato não encontrado.' });
      await audit(req.user.id, 'atualizou relato', found.title, [status, severity].filter(Boolean).join(' · '));
      return res.json({ id: found.id });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/admin/auditoria', requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const rows = pool
        ? (await pool.query(`SELECT a.id, a.action, a.target, a.detail, a.created_at AS "createdAt", u.name AS "admin"
            FROM admin_audit a LEFT JOIN users u ON u.id=a.admin_id ORDER BY a.created_at DESC LIMIT 50`)).rows
        : memory.audit.slice(0, 50).map(item => ({ ...item, admin: memory.users.find(user => user.id === item.adminId)?.name || '' }));
      return res.json(rows);
    } catch (error) {
      return next(error);
    }
  });
}
