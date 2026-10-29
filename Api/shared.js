import { randomInt, randomUUID } from 'node:crypto';
import { notify } from './notifications.js';
import { publicName } from './social.js';
import { initStore, memory, pool } from './store.js';

// Atividades compartilhadas: quem cria recebe um código de convite e repassa aos colegas; quem entra com o
// código vira participante. Cada participante tem o próprio status: concluir a sua parte nunca muda a dos outros.
// Só participantes veem a atividade, e de cada um sai apenas o nome público e a versão da foto.
// Encerrar ou remover alguém não apaga nada: a atividade fica marcada como encerrada e a pessoa, como removida.
// As atividades pessoais (tasks) não são alteradas por nada daqui.

export const memberStatuses = ['Pendente', 'Em andamento', 'Concluída'];
const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

let ready;
function initShared() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shared_activities (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', subject_name TEXT NOT NULL DEFAULT '',
        due_date TEXT NOT NULL DEFAULT '', due_time TEXT NOT NULL DEFAULT '', materials TEXT NOT NULL DEFAULT '',
        invite_code TEXT UNIQUE NOT NULL, closed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS shared_members (
        activity_id TEXT NOT NULL REFERENCES shared_activities(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'Pendente', removed BOOLEAN DEFAULT FALSE,
        joined_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (activity_id, user_id));
      CREATE INDEX IF NOT EXISTS shared_members_user_idx ON shared_members(user_id)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const oneLine = (value, max) => clean(value, max).replace(/\s+/g, ' ');
const memoryActivities = () => (memory.sharedActivities ||= []);
const memoryMembers = () => (memory.sharedMembers ||= []);
const memoryUser = id => memory.users.find(user => user.id === id) || {};
const newCode = () => Array.from({ length: 8 }, () => codeAlphabet[randomInt(codeAlphabet.length)]).join('');

function activityInput(body) {
  const title = oneLine(body?.title, 160);
  const dueDate = oneLine(body?.dueDate, 10);
  const dueTime = oneLine(body?.dueTime, 5);
  if (title.length < 2) return { error: 'Dê um nome para a atividade.' };
  if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { error: 'Use uma data válida para o prazo.' };
  if (dueTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) return { error: 'Use um horário válido.' };
  return { activity: { title, description: clean(body?.description, 4000), subjectName: oneLine(body?.subjectName, 100), dueDate, dueTime, materials: clean(body?.materials, 2000) } };
}

async function activityRow(id) {
  if (pool) {
    return (await pool.query(`SELECT id, owner_id AS "ownerId", title, description, subject_name AS "subjectName", due_date AS "dueDate", due_time AS "dueTime",
      materials, invite_code AS "inviteCode", closed, updated_at AS "updatedAt" FROM shared_activities WHERE id=$1`, [id])).rows[0];
  }
  return memoryActivities().find(item => item.id === id);
}

async function membersOf(activityId) {
  if (pool) {
    return (await pool.query(`SELECT m.user_id AS "userId", m.status, m.removed, m.updated_at AS "updatedAt", u.name, u.avatar_version AS "avatarVersion"
      FROM shared_members m JOIN users u ON u.id=m.user_id WHERE m.activity_id=$1 ORDER BY m.joined_at`, [activityId])).rows;
  }
  return memoryMembers().filter(item => item.activityId === activityId).map(item => ({ ...item, name: memoryUser(item.userId).name, avatarVersion: memoryUser(item.userId).avatar_version }));
}

// Devolve a atividade só para quem participa (ou é dono); senão, null.
async function visibleActivity(activityId, userId) {
  const activity = await activityRow(activityId);
  if (!activity) return null;
  const members = await membersOf(activityId);
  const me = members.find(member => member.userId === userId && !member.removed);
  if (!me && activity.ownerId !== userId) return null;
  return { activity, members, me };
}

const present = ({ activity, members }, userId) => ({
  id: activity.id,
  title: activity.title,
  description: activity.description,
  subjectName: activity.subjectName,
  dueDate: activity.dueDate,
  dueTime: activity.dueTime,
  materials: activity.materials,
  closed: Boolean(activity.closed),
  owner: activity.ownerId === userId,
  inviteCode: activity.ownerId === userId ? activity.inviteCode : undefined,
  members: members
    .filter(member => !member.removed)
    .map(member => ({ id: member.userId, name: publicName(member.name), avatarVersion: member.avatarVersion || '', status: member.status, owner: member.userId === activity.ownerId, me: member.userId === userId }))
});

async function listForUser(userId) {
  const ids = pool
    ? (await pool.query('SELECT activity_id AS id FROM shared_members WHERE user_id=$1 AND NOT removed', [userId])).rows.map(row => row.id)
    : memoryMembers().filter(item => item.userId === userId && !item.removed).map(item => item.activityId);
  const items = [];
  for (const id of ids) {
    const found = await visibleActivity(id, userId);
    if (found) items.push(present(found, userId));
  }
  return items.sort((a, b) => Number(a.closed) - Number(b.closed) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
}

async function setMember(activityId, userId, changes) {
  if (pool) {
    const sets = Object.keys(changes).map((key, index) => `${key}=$${index + 3}`).join(', ');
    await pool.query(`UPDATE shared_members SET ${sets}, updated_at=NOW() WHERE activity_id=$1 AND user_id=$2`, [activityId, userId, ...Object.values(changes)]);
    return;
  }
  const row = memoryMembers().find(item => item.activityId === activityId && item.userId === userId);
  if (row) Object.assign(row, changes);
}

// Avisa os outros participantes ativos.
async function notifyOthers(found, exceptUserId, message) {
  for (const member of found.members) {
    if (member.removed || member.userId === exceptUserId) continue;
    await notify(member.userId, { ...message, link: { page: 'compartilhadas', params: { id: found.activity.id } } });
  }
}

const joinWindows = new Map();
function joinRateLimit(req, res, next) {
  const now = Date.now();
  const recent = (joinWindows.get(req.user.id) || []).filter(time => now - time < 10 * 60_000);
  if (recent.length >= 10) return res.status(429).json({ error: 'Muitas tentativas de código. Aguarde alguns minutos.' });
  joinWindows.set(req.user.id, [...recent, now]);
  return next();
}

export function registerSharedRoutes(app, requireAuth) {
  const route = action => async (req, res, next) => {
    try {
      await initShared();
      return await action(req, res);
    } catch (error) {
      return next(error);
    }
  };
  const loadOr404 = async (req, res) => {
    const found = await visibleActivity(req.params.id, req.user.id);
    if (!found) res.status(404).json({ error: 'Atividade não encontrada ou você não participa dela.' });
    return found;
  };

  app.get('/api/v1/shared', requireAuth, route(async (req, res) => res.json(await listForUser(req.user.id))));

  app.post('/api/v1/shared', requireAuth, route(async (req, res) => {
    const { activity, error } = activityInput(req.body);
    if (error) return res.status(400).json({ error });
    const id = randomUUID();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newCode();
      try {
        if (pool) {
          await pool.query(`INSERT INTO shared_activities (id,owner_id,title,description,subject_name,due_date,due_time,materials,invite_code) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [id, req.user.id, activity.title, activity.description, activity.subjectName, activity.dueDate, activity.dueTime, activity.materials, code]);
          await pool.query('INSERT INTO shared_members (activity_id,user_id) VALUES ($1,$2)', [id, req.user.id]);
        } else {
          if (memoryActivities().some(item => item.inviteCode === code)) throw Object.assign(new Error('conflict'), { code: '23505' });
          memoryActivities().push({ id, ownerId: req.user.id, ...activity, inviteCode: code, closed: false, updatedAt: new Date() });
          memoryMembers().push({ activityId: id, userId: req.user.id, status: 'Pendente', removed: false });
        }
        return res.status(201).json(present(await visibleActivity(id, req.user.id), req.user.id));
      } catch (failure) {
        if (failure.code !== '23505') throw failure;
      }
    }
    return res.status(500).json({ error: 'Não foi possível gerar o código de convite. Tente de novo.' });
  }));

  app.patch('/api/v1/shared/:id', requireAuth, route(async (req, res) => {
    const found = await loadOr404(req, res);
    if (!found) return undefined;
    if (found.activity.ownerId !== req.user.id) return res.status(403).json({ error: 'Só quem criou a atividade pode editar.' });
    const { activity, error } = activityInput({ ...found.activity, ...req.body });
    if (error) return res.status(400).json({ error });
    const changedDue = activity.dueDate !== found.activity.dueDate || activity.dueTime !== found.activity.dueTime;
    if (pool) {
      await pool.query('UPDATE shared_activities SET title=$2, description=$3, subject_name=$4, due_date=$5, due_time=$6, materials=$7, updated_at=NOW() WHERE id=$1',
        [found.activity.id, activity.title, activity.description, activity.subjectName, activity.dueDate, activity.dueTime, activity.materials]);
    } else Object.assign(found.activity, activity, { updatedAt: new Date() });
    const stamp = Date.now().toString(36);
    await notifyOthers(found, req.user.id, {
      kind: 'compartilhada', key: `compartilhada-editada:${found.activity.id}:${stamp}`,
      title: `Atividade atualizada: ${activity.title}`,
      body: changedDue && activity.dueDate ? `O prazo agora é ${activity.dueDate.split('-').reverse().join('/')}${activity.dueTime ? ` às ${activity.dueTime}` : ''}.` : 'A descrição ou os materiais mudaram.'
    });
    return res.json(present(await visibleActivity(found.activity.id, req.user.id), req.user.id));
  }));

  app.post('/api/v1/shared/join', requireAuth, joinRateLimit, route(async (req, res) => {
    const code = oneLine(req.body?.code, 12).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const activity = pool
      ? (await pool.query('SELECT id, owner_id AS "ownerId", closed FROM shared_activities WHERE invite_code=$1', [code])).rows[0]
      : memoryActivities().find(item => item.inviteCode === code);
    if (!activity) return res.status(404).json({ error: 'Código não encontrado. Confira com quem compartilhou.' });
    if (activity.closed) return res.status(409).json({ error: 'Esta atividade foi encerrada por quem criou.' });
    const members = await membersOf(activity.id);
    const existing = members.find(member => member.userId === req.user.id);
    if (existing && !existing.removed) return res.json(present(await visibleActivity(activity.id, req.user.id), req.user.id));
    if (existing?.removed) return res.status(403).json({ error: 'Você foi removido desta atividade. Peça para quem criou te adicionar de novo.' });
    if (members.filter(member => !member.removed).length >= 30) return res.status(409).json({ error: 'Esta atividade já tem 30 participantes.' });
    if (pool) await pool.query('INSERT INTO shared_members (activity_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [activity.id, req.user.id]);
    else memoryMembers().push({ activityId: activity.id, userId: req.user.id, status: 'Pendente', removed: false });
    const found = await visibleActivity(activity.id, req.user.id);
    await notify(activity.ownerId, {
      kind: 'compartilhada', key: `compartilhada-entrou:${activity.id}:${req.user.id}`,
      title: `${publicName(req.user.name)} entrou na atividade`, body: found.activity.title,
      link: { page: 'compartilhadas', params: { id: activity.id } }
    });
    return res.status(201).json(present(found, req.user.id));
  }));

  // Muda só o status de quem pede.
  app.put('/api/v1/shared/:id/status', requireAuth, route(async (req, res) => {
    const found = await loadOr404(req, res);
    if (!found) return undefined;
    if (!found.me) return res.status(403).json({ error: 'Você não participa desta atividade.' });
    const status = oneLine(req.body?.status, 20);
    if (!memberStatuses.includes(status)) return res.status(400).json({ error: 'Escolha Pendente, Em andamento ou Concluída.' });
    await setMember(found.activity.id, req.user.id, { status });
    if (status === 'Concluída' && found.me.status !== 'Concluída') {
      await notifyOthers(found, req.user.id, {
        kind: 'compartilhada', key: `compartilhada-concluiu:${found.activity.id}:${req.user.id}`,
        title: `${publicName(req.user.name)} marcou a parte como concluída`, body: found.activity.title
      });
    }
    return res.json(present(await visibleActivity(found.activity.id, req.user.id), req.user.id));
  }));

  // Dono remove alguém, ou a própria pessoa sai. O dono não sai da própria atividade: ele encerra.
  app.delete('/api/v1/shared/:id/members/:userId', requireAuth, route(async (req, res) => {
    const found = await loadOr404(req, res);
    if (!found) return undefined;
    const owner = found.activity.ownerId === req.user.id;
    if (!owner && req.params.userId !== req.user.id) return res.status(403).json({ error: 'Só quem criou pode remover participantes.' });
    if (req.params.userId === found.activity.ownerId) return res.status(400).json({ error: 'Quem criou a atividade não pode sair dela. Use "Encerrar compartilhamento".' });
    if (!found.members.some(member => member.userId === req.params.userId && !member.removed)) return res.status(404).json({ error: 'Participante não encontrado.' });
    await setMember(found.activity.id, req.params.userId, { removed: true });
    return res.status(204).end();
  }));

  app.post('/api/v1/shared/:id/close', requireAuth, route(async (req, res) => {
    const found = await loadOr404(req, res);
    if (!found) return undefined;
    if (found.activity.ownerId !== req.user.id) return res.status(403).json({ error: 'Só quem criou pode encerrar.' });
    const closed = req.body?.closed !== false;
    if (pool) await pool.query('UPDATE shared_activities SET closed=$2, updated_at=NOW() WHERE id=$1', [found.activity.id, closed]);
    else found.activity.closed = closed;
    if (closed) {
      await notifyOthers(found, req.user.id, { kind: 'compartilhada', key: `compartilhada-encerrada:${found.activity.id}:${Date.now().toString(36)}`, title: `Compartilhamento encerrado: ${found.activity.title}`, body: 'A atividade continua visível para consulta.' });
    }
    return res.json(present(await visibleActivity(found.activity.id, req.user.id), req.user.id));
  }));

  app.post('/api/v1/shared/:id/code', requireAuth, route(async (req, res) => {
    const found = await loadOr404(req, res);
    if (!found) return undefined;
    if (found.activity.ownerId !== req.user.id) return res.status(403).json({ error: 'Só quem criou pode trocar o código.' });
    const code = newCode();
    if (pool) await pool.query('UPDATE shared_activities SET invite_code=$2 WHERE id=$1', [found.activity.id, code]);
    else found.activity.inviteCode = code;
    return res.json({ inviteCode: code });
  }));
}
