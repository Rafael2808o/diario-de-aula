import { initStore, memory, pool } from './store.js';
import { publicName } from './social.js';

// Papéis da V3.0: admin (tudo, inclusive dar papéis), moderador (comunicados e status do Conselho)
// e publicador (só publica comunicados). Sem linha na tabela = estudante comum.
// ADMIN_EMAILS (Render) define administradores iniciais, separados por vírgula.
export const roles = ['admin', 'moderador', 'publicador'];
const adminEmails = () => new Set(String(process.env.ADMIN_EMAILS || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean));

let ready;
function initRoles() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS user_roles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL, granted_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

export async function roleOf(user) {
  if (!user) return '';
  if (adminEmails().has(String(user.email || '').toLowerCase())) return 'admin';
  await initRoles();
  if (pool) return (await pool.query('SELECT role FROM user_roles WHERE user_id=$1', [user.id])).rows[0]?.role || '';
  return (memory.roles ||= new Map()).get(user.id) || '';
}

export const can = {
  publishNotice: role => roles.includes(role),
  moderate: role => role === 'admin' || role === 'moderador',
  grant: role => role === 'admin',
};

export function registerRoleRoutes(app, requireAuth) {
  app.get('/api/v1/me/role', requireAuth, async (req, res, next) => {
    try {
      return res.json({ role: await roleOf(req.user) });
    } catch (error) {
      return next(error);
    }
  });

  // Só admin: lista quem tem papel e procura pessoas pelo nome para dar um papel.
  app.get('/api/v1/roles', requireAuth, async (req, res, next) => {
    try {
      if (!can.grant(await roleOf(req.user))) return res.status(403).json({ error: 'Só a administração gerencia papéis.' });
      await initRoles();
      const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
      const users = pool
        ? (await pool.query(`SELECT u.id, u.name, u.avatar_version AS "avatarVersion", r.role FROM users u LEFT JOIN user_roles r ON r.user_id=u.id
            WHERE r.role IS NOT NULL OR ($1 <> '' AND lower(u.name) LIKE '%' || $1 || '%') ORDER BY r.role NULLS LAST, u.name LIMIT 40`, [q])).rows
        : memory.users.map(user => ({ id: user.id, name: user.name, avatarVersion: user.avatar_version, role: (memory.roles ||= new Map()).get(user.id) || null }))
          .filter(user => user.role || (q && user.name.toLowerCase().includes(q)));
      return res.json(users.map(user => ({ id: user.id, name: publicName(user.name), fullName: user.name, avatarVersion: user.avatarVersion || '', role: user.role || '' })));
    } catch (error) {
      return next(error);
    }
  });

  app.put('/api/v1/roles/:userId', requireAuth, async (req, res, next) => {
    try {
      if (!can.grant(await roleOf(req.user))) return res.status(403).json({ error: 'Só a administração gerencia papéis.' });
      await initRoles();
      const role = String(req.body?.role || '');
      if (role && !roles.includes(role)) return res.status(400).json({ error: 'Papel inválido.' });
      if (req.params.userId === req.user.id && role !== 'admin') return res.status(400).json({ error: 'Você não pode tirar o próprio papel de administração.' });
      if (pool) {
        if (!(await pool.query('SELECT 1 FROM users WHERE id=$1', [req.params.userId])).rowCount) return res.status(404).json({ error: 'Pessoa não encontrada.' });
        if (role) await pool.query(`INSERT INTO user_roles (user_id, role, granted_by) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET role=$2, granted_by=$3`, [req.params.userId, role, req.user.id]);
        else await pool.query('DELETE FROM user_roles WHERE user_id=$1', [req.params.userId]);
      } else {
        if (!memory.users.some(user => user.id === req.params.userId)) return res.status(404).json({ error: 'Pessoa não encontrada.' });
        if (role) (memory.roles ||= new Map()).set(req.params.userId, role);
        else memory.roles?.delete(req.params.userId);
      }
      return res.json({ userId: req.params.userId, role });
    } catch (error) {
      return next(error);
    }
  });
}
