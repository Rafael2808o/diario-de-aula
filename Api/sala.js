import { randomInt, randomUUID } from 'node:crypto';
import { notify } from './notifications.js';
import { publicName } from './social.js';
import { initStore, memory, pool } from './store.js';
import { awardXp } from './xp.js';
import { initShared, membersOf, notifyOthers, present, visibleActivity } from './shared.js';

// Sala de Estudos (antigas Atividades compartilhadas): perfil acadêmico (nome completo, RA, agência),
// integrantes adicionados por quem criou o trabalho, link do documento, quadro de tarefas, lembretes,
// penalidade de -300 XP para tarefa atrasada e sinalização das chamadas em grupo (WebRTC).
// Nada aqui apaga as atividades antigas: as tabelas shared_* só ganham colunas novas.

export const taskStatuses = ['Pendente', 'Em andamento', 'Concluído'];
const penaltyNoticeMs = 12 * 3600_000; // a tarefa precisa ter responsável pelo menos 12 h antes do prazo
const reminderWindowMs = 24 * 3600_000;

let ready;
function initSala() {
  ready ||= (async () => {
    await initStore();
    await initShared();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS academic_profiles (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        full_name TEXT NOT NULL DEFAULT '', ra TEXT NOT NULL DEFAULT '', has_agency BOOLEAN NOT NULL DEFAULT FALSE,
        agency TEXT NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS study_tasks (
        id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES shared_activities(id) ON DELETE CASCADE,
        title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        due_date TEXT NOT NULL DEFAULT '', due_time TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Pendente',
        assigned_at TIMESTAMPTZ, penalized BOOLEAN NOT NULL DEFAULT FALSE, position INTEGER NOT NULL DEFAULT 0,
        created_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS study_tasks_activity_idx ON study_tasks(activity_id)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max) : '');
const oneLine = (value, max) => clean(value, max).replace(/\s+/g, ' ');
const mem = () => {
  memory.academicProfiles ||= new Map();
  memory.studyTasks ||= [];
  return memory;
};
const memoryUser = id => memory.users.find(user => user.id === id) || {};
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
// Prazo no horário de Brasília (sem horário de verão desde 2019).
export const dueAt = (date, time) => (date ? new Date(`${date}T${time || '23:59'}:00-03:00`).getTime() : null);

export function safeUrl(value) {
  const text = clean(value, 1000);
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

// ---------- Perfil acadêmico ----------
async function profileOf(userId) {
  await initSala();
  if (pool) {
    const row = (await pool.query('SELECT full_name AS "fullName", ra, has_agency AS "hasAgency", agency, updated_at AS "updatedAt" FROM academic_profiles WHERE user_id=$1', [userId])).rows[0];
    return row ? { ...row, agency: parseList(row.agency) } : null;
  }
  return mem().academicProfiles.get(userId) || null;
}
const parseList = value => {
  try {
    const list = JSON.parse(value || '[]');
    return Array.isArray(list) ? list.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

async function peopleById(ids) {
  if (!ids.length) return [];
  const rows = pool
    ? (await pool.query('SELECT id, name, avatar_version AS "avatarVersion" FROM users WHERE id = ANY($1)', [ids])).rows
    : ids.map(id => memoryUser(id)).filter(user => user.id).map(user => ({ id: user.id, name: user.name, avatarVersion: user.avatar_version }));
  return rows.map(row => ({ id: row.id, name: publicName(row.name), avatarVersion: row.avatarVersion || '' }));
}

// Nome completo e RA de cada integrante (só para quem participa do trabalho).
async function rosterOf(activityId) {
  const members = (await membersOf(activityId)).filter(member => !member.removed);
  const lines = [];
  for (const member of members) {
    const profile = await profileOf(member.userId);
    lines.push({ name: (profile?.fullName || member.name || '').toUpperCase(), ra: profile?.ra || '' });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// ---------- Tarefas ----------
async function tasksOf(activityId) {
  await initSala();
  const rows = pool
    ? (await pool.query(`SELECT t.id, t.title, t.description, t.assignee_id AS "assigneeId", t.due_date AS "dueDate", t.due_time AS "dueTime", t.status,
        t.assigned_at AS "assignedAt", t.penalized, t.created_at AS "createdAt", t.updated_at AS "updatedAt", u.name AS "assigneeName", u.avatar_version AS "avatarVersion"
        FROM study_tasks t LEFT JOIN users u ON u.id=t.assignee_id WHERE t.activity_id=$1 ORDER BY t.created_at`, [activityId])).rows
    : mem().studyTasks.filter(item => item.activityId === activityId).map(item => ({ ...item, assigneeName: memoryUser(item.assigneeId).name, avatarVersion: memoryUser(item.assigneeId).avatar_version }));
  return rows.map(row => ({
    id: row.id, title: row.title, description: row.description, dueDate: row.dueDate, dueTime: row.dueTime, status: row.status, penalized: Boolean(row.penalized),
    assignee: row.assigneeId ? { id: row.assigneeId, name: publicName(row.assigneeName || ''), avatarVersion: row.avatarVersion || '' } : null,
    updatedAt: new Date(row.updatedAt || row.createdAt || Date.now()).toISOString()
  }));
}

async function taskRow(activityId, taskId) {
  if (pool) return (await pool.query('SELECT id, title, description, assignee_id AS "assigneeId", due_date AS "dueDate", due_time AS "dueTime", status, assigned_at AS "assignedAt", penalized FROM study_tasks WHERE id=$1 AND activity_id=$2', [taskId, activityId])).rows[0];
  return mem().studyTasks.find(item => item.id === taskId && item.activityId === activityId);
}

function taskInput(body, activeIds) {
  const title = oneLine(body?.title, 160);
  const dueDate = oneLine(body?.dueDate, 10);
  const dueTime = oneLine(body?.dueTime, 5);
  const status = oneLine(body?.status, 20) || 'Pendente';
  const assigneeId = body?.assigneeId ? String(body.assigneeId) : null;
  if (title.length < 2) return { error: 'Dê um título para a tarefa.' };
  if (dueDate && !isDate(dueDate)) return { error: 'Use uma data válida para o prazo.' };
  if (dueTime && !isTime(dueTime)) return { error: 'Use um horário válido.' };
  if (!taskStatuses.includes(status)) return { error: 'Escolha Pendente, Em andamento ou Concluído.' };
  if (assigneeId && !activeIds.includes(assigneeId)) return { error: 'O responsável precisa ser integrante do trabalho.' };
  return { task: { title, description: clean(body?.description, 2000), dueDate, dueTime, status, assigneeId } };
}

// -300 XP para quem tinha a tarefa e deixou passar do prazo sem concluir. Uma vez por tarefa
// (o registro de XP é único por tarefa), só se a pessoa recebeu a tarefa com pelo menos 12 h de antecedência.
export async function applyOverduePenalties(now = Date.now()) {
  await initSala();
  const rows = pool
    ? (await pool.query(`SELECT t.id, t.activity_id AS "activityId", t.title, t.assignee_id AS "assigneeId", t.due_date AS "dueDate", t.due_time AS "dueTime", t.assigned_at AS "assignedAt"
        FROM study_tasks t JOIN shared_activities a ON a.id=t.activity_id
        WHERE NOT t.penalized AND t.status <> 'Concluído' AND t.assignee_id IS NOT NULL AND t.due_date <> '' AND NOT a.closed`)).rows
    : mem().studyTasks.filter(item => !item.penalized && item.status !== 'Concluído' && item.assigneeId && item.dueDate && !memory.sharedActivities?.find(a => a.id === item.activityId)?.closed);
  let applied = 0;
  for (const task of rows) {
    const due = dueAt(task.dueDate, task.dueTime);
    if (!due || now <= due) continue;
    const assignedAt = task.assignedAt ? new Date(task.assignedAt).getTime() : null;
    const members = await membersOf(task.activityId);
    const stillMember = members.some(member => member.userId === task.assigneeId && !member.removed);
    const fair = stillMember && assignedAt !== null && assignedAt <= due - penaltyNoticeMs;
    if (pool) await pool.query('UPDATE study_tasks SET penalized=TRUE WHERE id=$1', [task.id]);
    else Object.assign(mem().studyTasks.find(item => item.id === task.id) || {}, { penalized: true });
    if (!fair) continue;
    if (await awardXp(task.assigneeId, 'tarefa-atrasada', task.id, { text: `Tarefa atrasada: ${task.title}` })) {
      applied += 1;
      await notify(task.assigneeId, { kind: 'compartilhada', key: `tarefa-atrasada:${task.id}`, title: 'A tarefa passou do prazo: -300 XP', body: task.title, link: { page: 'compartilhadas', params: { id: task.activityId } } }).catch(() => {});
    }
  }
  return applied;
}
let lastPenaltyCheck = 0;
const checkPenaltiesQuietly = () => {
  if (Date.now() - lastPenaltyCheck < 60_000) return;
  lastPenaltyCheck = Date.now();
  applyOverduePenalties().catch(error => console.error('penalidade de tarefa', error));
};

// ---------- Chamadas em grupo (sinalização WebRTC) ----------
// A mídia vai direto entre os aparelhos; o servidor só repassa as mensagens de conexão.
// Fica na memória do servidor: quem some por mais de 20 s sai da chamada.
const rooms = new Map();
const callStaleMs = 20_000;
function room(activityId) {
  let found = rooms.get(activityId);
  if (!found) {
    found = { participants: new Map(), queues: new Map(), startedAt: Date.now() };
    rooms.set(activityId, found);
  }
  const now = Date.now();
  for (const [id, person] of found.participants) {
    if (now - person.seenAt > callStaleMs) {
      found.participants.delete(id);
      found.queues.delete(id);
      for (const queue of found.queues.values()) queue.push({ from: id, type: 'leave' });
    }
  }
  return found;
}
const roomView = (found, userId) => ({
  participants: [...found.participants.values()].map(person => ({ id: person.id, name: person.name, avatarVersion: person.avatarVersion, mic: person.mic, cam: person.cam, me: person.id === userId })),
  startedAt: new Date(found.startedAt).toISOString()
});

export function registerSalaRoutes(app, requireAuth) {
  const route = action => async (req, res, next) => {
    try {
      await initSala();
      return await action(req, res);
    } catch (error) {
      return next(error);
    }
  };
  const member = async (req, res) => {
    const found = await visibleActivity(req.params.id, req.user.id);
    if (!found || !found.me) {
      res.status(404).json({ error: 'Trabalho não encontrado ou você não participa dele.' });
      return null;
    }
    return found;
  };
  const timer = setInterval(() => applyOverduePenalties().catch(error => console.error('penalidade de tarefa', error)), 15 * 60_000);
  timer.unref?.();

  // Perfil acadêmico
  app.get('/api/v1/sala/perfil', requireAuth, route(async (req, res) => {
    const profile = await profileOf(req.user.id);
    return res.json({ done: Boolean(profile), fullName: profile?.fullName || '', ra: profile?.ra || '', hasAgency: Boolean(profile?.hasAgency), agency: await peopleById(profile?.agency || []) });
  }));
  app.put('/api/v1/sala/perfil', requireAuth, route(async (req, res) => {
    const fullName = oneLine(req.body?.fullName, 120);
    const ra = oneLine(req.body?.ra, 30);
    const hasAgency = req.body?.hasAgency === true;
    const agency = hasAgency ? [...new Set((Array.isArray(req.body?.agency) ? req.body.agency : []).map(String))].filter(id => id !== req.user.id).slice(0, 20) : [];
    if (fullName.length < 3) return res.status(400).json({ error: 'Informe seu nome completo.' });
    if (ra && !/^[\w.\-/ ]{1,30}$/.test(ra)) return res.status(400).json({ error: 'Use só letras, números, ponto ou traço no RA.' });
    const valid = (await peopleById(agency)).map(person => person.id);
    if (pool) {
      await pool.query(`INSERT INTO academic_profiles (user_id, full_name, ra, has_agency, agency) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (user_id) DO UPDATE SET full_name=$2, ra=$3, has_agency=$4, agency=$5, updated_at=NOW()`, [req.user.id, fullName, ra, hasAgency, JSON.stringify(valid)]);
    } else mem().academicProfiles.set(req.user.id, { fullName, ra, hasAgency, agency: valid, updatedAt: new Date() });
    return res.json({ done: true, fullName, ra, hasAgency, agency: await peopleById(valid) });
  }));

  // Busca de colegas pelo nome (só nome público e foto).
  app.get('/api/v1/sala/pessoas', requireAuth, route(async (req, res) => {
    const q = oneLine(String(req.query.q || ''), 60).toLowerCase();
    if (q.length < 2) return res.json([]);
    const rows = pool
      ? (await pool.query(`SELECT id, name, avatar_version AS "avatarVersion" FROM users WHERE id <> $1 AND lower(name) LIKE '%' || $2 || '%' ORDER BY name LIMIT 20`, [req.user.id, q])).rows
      : memory.users.filter(user => user.id !== req.user.id && user.name.toLowerCase().includes(q)).slice(0, 20).map(user => ({ id: user.id, name: user.name, avatarVersion: user.avatar_version }));
    return res.json(rows.map(row => ({ id: row.id, name: publicName(row.name), avatarVersion: row.avatarVersion || '' })));
  }));

  // Sorteio: colegas do mesmo curso e da mesma instituição (quem preencheu esses dados).
  app.post('/api/v1/sala/sorteio', requireAuth, route(async (req, res) => {
    const count = Math.max(1, Math.min(29, Number.parseInt(req.body?.count, 10) || 1));
    const exclude = new Set([req.user.id, ...(Array.isArray(req.body?.exclude) ? req.body.exclude.map(String) : [])]);
    const me = pool ? (await pool.query('SELECT course, institution FROM users WHERE id=$1', [req.user.id])).rows[0] : memoryUser(req.user.id);
    const course = String(me?.course || '').trim().toLowerCase();
    const institution = String(me?.institution || '').trim().toLowerCase();
    if (!course || !institution) return res.status(400).json({ error: 'Preencha seu curso e sua faculdade em Configurações para sortear colegas da sua turma.' });
    const pool_ = pool
      ? (await pool.query('SELECT id, name, avatar_version AS "avatarVersion" FROM users WHERE lower(trim(course))=$1 AND lower(trim(institution))=$2', [course, institution])).rows
      : memory.users.filter(user => String(user.course || '').trim().toLowerCase() === course && String(user.institution || '').trim().toLowerCase() === institution).map(user => ({ id: user.id, name: user.name, avatarVersion: user.avatar_version }));
    const candidates = pool_.filter(row => !exclude.has(row.id));
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const picked = candidates.slice(0, count).map(row => ({ id: row.id, name: publicName(row.name), avatarVersion: row.avatarVersion || '' }));
    return res.json({ people: picked, available: candidates.length });
  }));

  // Quem criou adiciona integrantes; cada pessoa recebe o aviso.
  app.post('/api/v1/shared/:id/members', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    if (found.activity.ownerId !== req.user.id) return res.status(403).json({ error: 'Só quem cadastrou o trabalho adiciona integrantes.' });
    const ids = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(String))].filter(id => id !== req.user.id).slice(0, 29);
    const people = await peopleById(ids);
    const active = found.members.filter(item => !item.removed).length;
    if (active + people.length > 30) return res.status(409).json({ error: 'O trabalho pode ter até 30 integrantes.' });
    for (const person of people) {
      const existing = found.members.find(item => item.userId === person.id);
      if (existing && !existing.removed) continue;
      if (pool) {
        await pool.query(`INSERT INTO shared_members (activity_id,user_id) VALUES ($1,$2) ON CONFLICT (activity_id,user_id) DO UPDATE SET removed=FALSE, updated_at=NOW()`, [found.activity.id, person.id]);
      } else if (existing) existing.removed = false;
      else memory.sharedMembers.push({ activityId: found.activity.id, userId: person.id, status: 'Pendente', removed: false });
      await notify(person.id, {
        kind: 'compartilhada', key: `sala-adicionado:${found.activity.id}:${person.id}:${Date.now().toString(36)}`,
        title: `${publicName(req.user.name)} te adicionou ao grupo do trabalho ${found.activity.title}.`, body: found.activity.subjectName || 'Sala de Estudos',
        link: { page: 'compartilhadas', params: { id: found.activity.id } }
      }).catch(() => {});
    }
    return res.json(present(await visibleActivity(found.activity.id, req.user.id), req.user.id));
  }));

  // Documento do trabalho: qualquer integrante salva, troca ou tira o link.
  app.put('/api/v1/shared/:id/documento', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const url = safeUrl(req.body?.url);
    if (url === null) return res.status(400).json({ error: 'Cole um link completo, começando com https://.' });
    if (pool) await pool.query('UPDATE shared_activities SET doc_url=$2, updated_at=NOW() WHERE id=$1', [found.activity.id, url]);
    else found.activity.docUrl = url;
    if (url) await notifyOthers(found, req.user.id, { kind: 'compartilhada', key: `sala-documento:${found.activity.id}:${Date.now().toString(36)}`, title: `Documento do trabalho atualizado: ${found.activity.title}`, body: 'O link do documento do grupo está na Sala de Estudos.' }).catch(() => {});
    return res.json(present(await visibleActivity(found.activity.id, req.user.id), req.user.id));
  }));

  // Lista de integrantes com nome completo e RA, em ordem alfabética.
  app.get('/api/v1/shared/:id/lista', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const lines = await rosterOf(found.activity.id);
    return res.json({ lines, text: lines.map(line => `${line.name} — RA: ${line.ra || 'não informado'}`).join('\n') });
  }));

  // Quadro de tarefas
  app.get('/api/v1/shared/:id/tasks', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    checkPenaltiesQuietly();
    return res.json(await tasksOf(found.activity.id));
  }));
  app.post('/api/v1/shared/:id/tasks', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    if (found.activity.closed) return res.status(409).json({ error: 'Este trabalho foi encerrado.' });
    const activeIds = found.members.filter(item => !item.removed).map(item => item.userId);
    const { task, error } = taskInput(req.body, activeIds);
    if (error) return res.status(400).json({ error });
    const id = randomUUID();
    const assignedAt = task.assigneeId ? new Date() : null;
    if (pool) {
      await pool.query(`INSERT INTO study_tasks (id,activity_id,title,description,assignee_id,due_date,due_time,status,assigned_at,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, found.activity.id, task.title, task.description, task.assigneeId, task.dueDate, task.dueTime, task.status, assignedAt, req.user.id]);
    } else mem().studyTasks.push({ id, activityId: found.activity.id, ...task, assignedAt, penalized: false, createdBy: req.user.id, createdAt: new Date(), updatedAt: new Date() });
    if (task.assigneeId && task.assigneeId !== req.user.id) {
      await notify(task.assigneeId, { kind: 'compartilhada', key: `sala-tarefa:${id}`, title: `Nova tarefa para você: ${task.title}`, body: found.activity.title, link: { page: 'compartilhadas', params: { id: found.activity.id } } }).catch(() => {});
    }
    return res.status(201).json(await tasksOf(found.activity.id));
  }));
  app.patch('/api/v1/shared/:id/tasks/:taskId', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const row = await taskRow(found.activity.id, req.params.taskId);
    if (!row) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    const activeIds = found.members.filter(item => !item.removed).map(item => item.userId);
    const current = { title: row.title, description: row.description, dueDate: row.dueDate, dueTime: row.dueTime, status: row.status, assigneeId: row.assigneeId };
    const { task, error } = taskInput({ ...current, ...req.body }, activeIds);
    if (error) return res.status(400).json({ error });
    const reassigned = task.assigneeId !== row.assigneeId;
    const assignedAt = reassigned ? (task.assigneeId ? new Date() : null) : row.assignedAt;
    // Prazo novo ou novo responsável: a penalidade volta a valer para o prazo atual.
    const resetPenalty = reassigned || task.dueDate !== row.dueDate || task.dueTime !== row.dueTime;
    if (pool) {
      await pool.query(`UPDATE study_tasks SET title=$2, description=$3, assignee_id=$4, due_date=$5, due_time=$6, status=$7, assigned_at=$8, penalized=CASE WHEN $9 THEN FALSE ELSE penalized END, updated_at=NOW() WHERE id=$1`,
        [row.id, task.title, task.description, task.assigneeId, task.dueDate, task.dueTime, task.status, assignedAt, resetPenalty]);
    } else Object.assign(row, task, { assignedAt, updatedAt: new Date() }, resetPenalty ? { penalized: false } : {});
    if (reassigned && task.assigneeId && task.assigneeId !== req.user.id) {
      await notify(task.assigneeId, { kind: 'compartilhada', key: `sala-tarefa:${row.id}:${task.assigneeId}`, title: `Nova tarefa para você: ${task.title}`, body: found.activity.title, link: { page: 'compartilhadas', params: { id: found.activity.id } } }).catch(() => {});
    }
    return res.json(await tasksOf(found.activity.id));
  }));
  app.delete('/api/v1/shared/:id/tasks/:taskId', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    if (pool) await pool.query('DELETE FROM study_tasks WHERE id=$1 AND activity_id=$2', [req.params.taskId, found.activity.id]);
    else memory.studyTasks = mem().studyTasks.filter(item => !(item.id === req.params.taskId && item.activityId === found.activity.id));
    return res.json(await tasksOf(found.activity.id));
  }));
  // Lembrete para o responsável: a partir de 1 dia antes do prazo, um por pessoa por tarefa a cada dia.
  app.post('/api/v1/shared/:id/tasks/:taskId/lembrete', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const row = await taskRow(found.activity.id, req.params.taskId);
    if (!row) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    if (!row.assigneeId) return res.status(400).json({ error: 'Esta tarefa ainda não tem responsável.' });
    if (row.assigneeId === req.user.id) return res.status(400).json({ error: 'A tarefa é sua: não dá para lembrar você mesmo.' });
    if (row.status === 'Concluído') return res.status(400).json({ error: 'Esta tarefa já foi concluída.' });
    const due = dueAt(row.dueDate, row.dueTime);
    if (!due) return res.status(400).json({ error: 'Defina um prazo para a tarefa antes de enviar lembretes.' });
    if (Date.now() < due - reminderWindowMs) return res.status(400).json({ error: 'Os lembretes ficam disponíveis a partir de 1 dia antes do prazo.' });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    const sent = await notify(row.assigneeId, {
      kind: 'compartilhada', key: `sala-lembrete:${row.id}:${req.user.id}:${day}`,
      title: 'Ei, sua parte ainda está pendente! O prazo está chegando. 🧙‍♀️', body: `${row.title} · ${found.activity.title} · lembrete de ${publicName(req.user.name)}`,
      link: { page: 'compartilhadas', params: { id: found.activity.id } }
    });
    return res.json({ sent: sent !== false });
  }));

  // Chamada em grupo
  app.get('/api/v1/shared/:id/chamada', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const current = room(found.activity.id);
    const me = current.participants.get(req.user.id);
    let signals = [];
    if (me) {
      me.seenAt = Date.now();
      signals = current.queues.get(req.user.id) || [];
      current.queues.set(req.user.id, []);
    }
    return res.json({ ...roomView(current, req.user.id), joined: Boolean(me), signals });
  }));
  app.post('/api/v1/shared/:id/chamada/entrar', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const current = room(found.activity.id);
    const wasEmpty = current.participants.size === 0;
    if (wasEmpty) current.startedAt = Date.now();
    if (current.participants.size >= 8 && !current.participants.has(req.user.id)) return res.status(409).json({ error: 'A chamada já tem 8 pessoas, o limite para funcionar bem.' });
    const user = pool ? (await pool.query('SELECT avatar_version AS "avatarVersion" FROM users WHERE id=$1', [req.user.id])).rows[0] : { avatarVersion: memoryUser(req.user.id).avatar_version };
    current.participants.set(req.user.id, { id: req.user.id, name: publicName(req.user.name), avatarVersion: user?.avatarVersion || '', mic: req.body?.mic !== false, cam: req.body?.cam === true, seenAt: Date.now() });
    current.queues.set(req.user.id, []);
    // Quem já estava recebe "join" e inicia a conexão com quem chegou.
    for (const [id, queue] of current.queues) if (id !== req.user.id) queue.push({ from: req.user.id, type: 'join' });
    if (wasEmpty) {
      await notifyOthers(found, req.user.id, { kind: 'compartilhada', key: `sala-chamada:${found.activity.id}:${Math.floor(Date.now() / 600_000)}`, title: `Chamada em grupo começou: ${found.activity.title}`, body: `${publicName(req.user.name)} está na chamada.` }).catch(() => {});
    }
    return res.json({ ...roomView(current, req.user.id), joined: true, signals: [] });
  }));
  app.post('/api/v1/shared/:id/chamada/sinal', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const current = room(found.activity.id);
    if (!current.participants.has(req.user.id)) return res.status(409).json({ error: 'Entre na chamada primeiro.' });
    const to = String(req.body?.to || '');
    const type = String(req.body?.type || '');
    if (!['offer', 'answer', 'candidate', 'state'].includes(type)) return res.status(400).json({ error: 'Sinal inválido.' });
    const payload = JSON.stringify(req.body?.data ?? null);
    if (payload.length > 20_000) return res.status(413).json({ error: 'Sinal grande demais.' });
    const me = current.participants.get(req.user.id);
    me.seenAt = Date.now();
    if (type === 'state') {
      me.mic = req.body?.data?.mic !== false;
      me.cam = req.body?.data?.cam === true;
      return res.json({ ok: true });
    }
    const queue = current.queues.get(to);
    if (!queue) return res.status(404).json({ error: 'Esta pessoa saiu da chamada.' });
    queue.push({ from: req.user.id, type, data: req.body.data });
    if (queue.length > 500) queue.splice(0, queue.length - 500);
    return res.json({ ok: true });
  }));
  app.post('/api/v1/shared/:id/chamada/sair', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const current = room(found.activity.id);
    const endAll = req.body?.encerrar === true && found.activity.ownerId === req.user.id;
    const leaving = endAll ? [...current.participants.keys()] : [req.user.id];
    for (const id of leaving) {
      current.participants.delete(id);
      current.queues.delete(id);
    }
    for (const queue of current.queues.values()) for (const id of leaving) queue.push({ from: id, type: 'leave' });
    if (endAll) rooms.delete(found.activity.id);
    return res.json({ ok: true });
  }));
}
