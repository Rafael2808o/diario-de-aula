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
      CREATE INDEX IF NOT EXISTS study_tasks_activity_idx ON study_tasks(activity_id);
      -- Versão 4.0: quem salva o perfil depois desta versão confirmou o nome completo (antes, o formulário vinha
      -- preenchido com o nome de exibição). Perfis antigos ficam como estão, só sem confirmação.
      ALTER TABLE academic_profiles ADD COLUMN IF NOT EXISTS name_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
      -- Versão 4.0: uma tarefa pode ter várias pessoas. Cada uma tem data de atribuição, penalidade e "minha parte
      -- feita" próprias. assignee_id continua sendo o primeiro responsável (compatibilidade); o preenchimento abaixo
      -- só copia o responsável antigo e não repete linhas.
      CREATE TABLE IF NOT EXISTS study_task_assignees (
        task_id TEXT NOT NULL REFERENCES study_tasks(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        assigned_at TIMESTAMPTZ DEFAULT NOW(), penalized BOOLEAN NOT NULL DEFAULT FALSE,
        done BOOLEAN NOT NULL DEFAULT FALSE, done_at TIMESTAMPTZ, PRIMARY KEY (task_id, user_id));
      CREATE INDEX IF NOT EXISTS study_task_assignees_user_idx ON study_task_assignees(user_id);
      INSERT INTO study_task_assignees (task_id, user_id, assigned_at, penalized, done)
        SELECT id, assignee_id, COALESCE(assigned_at, created_at), penalized, status = 'Concluído' FROM study_tasks WHERE assignee_id IS NOT NULL
        ON CONFLICT DO NOTHING`);
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
  memory.taskAssignees ||= [];
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
    const row = (await pool.query('SELECT full_name AS "fullName", ra, has_agency AS "hasAgency", agency, name_confirmed AS "nameConfirmed", updated_at AS "updatedAt" FROM academic_profiles WHERE user_id=$1', [userId])).rows[0];
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
    // Sem perfil, ou com o nome completo igual ao nome de exibição: a pessoa ainda precisa confirmar.
    const pending = !profile?.fullName || (!profile.nameConfirmed && profile.fullName.trim().toLowerCase() === String(member.name || '').trim().toLowerCase());
    lines.push({ name: (profile?.fullName || member.name || '').toUpperCase(), ra: profile?.ra || '', pending, displayName: member.name || '' });
  }
  return lines.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

// ---------- Tarefas ----------
// Responsáveis de cada tarefa (study_task_assignees), na ordem em que foram escolhidos.
async function assigneesOf(taskIds) {
  if (!taskIds.length) return [];
  if (pool) {
    return (await pool.query(`SELECT a.task_id AS "taskId", a.user_id AS "userId", a.assigned_at AS "assignedAt", a.penalized, a.done, u.name, u.avatar_version AS "avatarVersion"
      FROM study_task_assignees a JOIN users u ON u.id=a.user_id WHERE a.task_id = ANY($1) ORDER BY a.assigned_at, u.name`, [taskIds])).rows;
  }
  return mem().taskAssignees.filter(item => taskIds.includes(item.taskId)).map(item => ({ ...item, name: memoryUser(item.userId).name, avatarVersion: memoryUser(item.userId).avatar_version }));
}

async function tasksOf(activityId) {
  await initSala();
  const rows = pool
    ? (await pool.query(`SELECT t.id, t.title, t.description, t.due_date AS "dueDate", t.due_time AS "dueTime", t.status, t.penalized, t.created_at AS "createdAt", t.updated_at AS "updatedAt"
        FROM study_tasks t WHERE t.activity_id=$1 ORDER BY t.created_at`, [activityId])).rows
    : mem().studyTasks.filter(item => item.activityId === activityId);
  const assignees = await assigneesOf(rows.map(row => row.id));
  return rows.map(row => {
    const people = assignees.filter(item => item.taskId === row.id).map(item => ({ id: item.userId, name: publicName(item.name || ''), avatarVersion: item.avatarVersion || '', done: Boolean(item.done) }));
    return {
      id: row.id, title: row.title, description: row.description, dueDate: row.dueDate, dueTime: row.dueTime, status: row.status, penalized: Boolean(row.penalized),
      assignees: people,
      // Compatibilidade com o app antigo: o primeiro responsável.
      assignee: people[0] ? { id: people[0].id, name: people[0].name, avatarVersion: people[0].avatarVersion } : null,
      updatedAt: new Date(row.updatedAt || row.createdAt || Date.now()).toISOString()
    };
  });
}

async function taskRow(activityId, taskId) {
  const row = pool
    ? (await pool.query('SELECT id, title, description, due_date AS "dueDate", due_time AS "dueTime", status FROM study_tasks WHERE id=$1 AND activity_id=$2', [taskId, activityId])).rows[0]
    : mem().studyTasks.find(item => item.id === taskId && item.activityId === activityId);
  if (!row) return null;
  return { ...row, assignees: await assigneesOf([row.id]) };
}

// Aceita assigneeIds (vários) ou assigneeId (app antigo). Todos precisam ser integrantes ativos.
function taskInput(body, activeIds, current = []) {
  const title = oneLine(body?.title, 160);
  const dueDate = oneLine(body?.dueDate, 10);
  const dueTime = oneLine(body?.dueTime, 5);
  const status = oneLine(body?.status, 20) || 'Pendente';
  const raw = Array.isArray(body?.assigneeIds) ? body.assigneeIds : body?.assigneeId !== undefined ? (body.assigneeId ? [body.assigneeId] : []) : current;
  const assigneeIds = [...new Set(raw.map(String))].slice(0, 30);
  if (title.length < 2) return { error: 'Dê um título para a tarefa.' };
  if (dueDate && !isDate(dueDate)) return { error: 'Use uma data válida para o prazo.' };
  if (dueTime && !isTime(dueTime)) return { error: 'Use um horário válido.' };
  if (!taskStatuses.includes(status)) return { error: 'Escolha Pendente, Em andamento ou Concluído.' };
  if (assigneeIds.some(id => !activeIds.includes(id))) return { error: 'Os responsáveis precisam ser integrantes do trabalho.' };
  return { task: { title, description: clean(body?.description, 2000), dueDate, dueTime, status, assigneeIds } };
}

// Grava a lista de responsáveis: quem saiu perde a linha, quem entrou começa agora (para a regra das 12 h).
async function saveAssignees(taskId, ids, { resetPenalty = false } = {}) {
  const before = (await assigneesOf([taskId])).map(item => item.userId);
  const added = ids.filter(id => !before.includes(id));
  if (pool) {
    await pool.query('DELETE FROM study_task_assignees WHERE task_id=$1 AND NOT (user_id = ANY($2))', [taskId, ids]);
    for (const id of added) await pool.query('INSERT INTO study_task_assignees (task_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [taskId, id]);
    if (resetPenalty) await pool.query('UPDATE study_task_assignees SET penalized=FALSE WHERE task_id=$1', [taskId]);
    await pool.query('UPDATE study_tasks SET assignee_id=$2, assigned_at=CASE WHEN $2::text IS NULL THEN NULL ELSE COALESCE(assigned_at, NOW()) END WHERE id=$1', [taskId, ids[0] || null]);
  } else {
    memory.taskAssignees = mem().taskAssignees.filter(item => item.taskId !== taskId || ids.includes(item.userId));
    for (const id of added) memory.taskAssignees.push({ taskId, userId: id, assignedAt: new Date(), penalized: false, done: false });
    if (resetPenalty) memory.taskAssignees.filter(item => item.taskId === taskId).forEach(item => { item.penalized = false; });
    const task = mem().studyTasks.find(item => item.id === taskId);
    if (task) task.assigneeId = ids[0] || null;
  }
  return added;
}

// -300 XP para cada responsável que deixou passar do prazo sem concluir a sua parte. Uma vez por pessoa e tarefa
// (o registro de XP é único por pessoa + tarefa), só se a pessoa recebeu a tarefa com pelo menos 12 h de antecedência.
export async function applyOverduePenalties(now = Date.now()) {
  await initSala();
  const rows = pool
    ? (await pool.query(`SELECT t.id, t.activity_id AS "activityId", t.title, t.due_date AS "dueDate", t.due_time AS "dueTime", s.user_id AS "userId", s.assigned_at AS "assignedAt"
        FROM study_task_assignees s JOIN study_tasks t ON t.id=s.task_id JOIN shared_activities a ON a.id=t.activity_id
        WHERE NOT s.penalized AND NOT s.done AND t.status <> 'Concluído' AND t.due_date <> '' AND NOT a.closed`)).rows
    : mem().taskAssignees.filter(item => !item.penalized && !item.done).flatMap(item => {
      const task = mem().studyTasks.find(row => row.id === item.taskId);
      if (!task || task.status === 'Concluído' || !task.dueDate || memory.sharedActivities?.find(a => a.id === task.activityId)?.closed) return [];
      return [{ id: task.id, activityId: task.activityId, title: task.title, dueDate: task.dueDate, dueTime: task.dueTime, userId: item.userId, assignedAt: item.assignedAt }];
    });
  let applied = 0;
  for (const task of rows) {
    const due = dueAt(task.dueDate, task.dueTime);
    if (!due || now <= due) continue;
    const assignedAt = task.assignedAt ? new Date(task.assignedAt).getTime() : null;
    const members = await membersOf(task.activityId);
    const stillMember = members.some(member => member.userId === task.userId && !member.removed);
    const fair = stillMember && assignedAt !== null && assignedAt <= due - penaltyNoticeMs;
    if (pool) await pool.query('UPDATE study_task_assignees SET penalized=TRUE WHERE task_id=$1 AND user_id=$2', [task.id, task.userId]);
    else Object.assign(mem().taskAssignees.find(item => item.taskId === task.id && item.userId === task.userId) || {}, { penalized: true });
    if (!fair) continue;
    if (await awardXp(task.userId, 'tarefa-atrasada', task.id, { text: `Tarefa atrasada: ${task.title}` })) {
      applied += 1;
      await notify(task.userId, { kind: 'compartilhada', key: `tarefa-atrasada:${task.id}`, title: 'A tarefa passou do prazo: -300 XP', body: task.title, link: { page: 'compartilhadas', params: { id: task.activityId } } }).catch(() => {});
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
    const needsReview = Boolean(profile?.fullName) && !profile.nameConfirmed && profile.fullName.trim().toLowerCase() === String(req.user.name || '').trim().toLowerCase();
    return res.json({ done: Boolean(profile), needsReview, fullName: profile?.fullName || '', ra: profile?.ra || '', hasAgency: Boolean(profile?.hasAgency), agency: await peopleById(profile?.agency || []) });
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
      await pool.query(`INSERT INTO academic_profiles (user_id, full_name, ra, has_agency, agency, name_confirmed) VALUES ($1,$2,$3,$4,$5,TRUE)
        ON CONFLICT (user_id) DO UPDATE SET full_name=$2, ra=$3, has_agency=$4, agency=$5, name_confirmed=TRUE, updated_at=NOW()`, [req.user.id, fullName, ra, hasAgency, JSON.stringify(valid)]);
    } else mem().academicProfiles.set(req.user.id, { fullName, ra, hasAgency, agency: valid, nameConfirmed: true, updatedAt: new Date() });
    return res.json({ done: true, needsReview: false, fullName, ra, hasAgency, agency: await peopleById(valid) });
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
    return res.json({ lines, pending: lines.filter(line => line.pending).map(line => line.displayName), text: lines.map(line => `${line.name} — RA: ${line.ra || 'não informado'}`).join('\n') });
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
    // Evita duas tarefas abertas iguais no mesmo trabalho.
    const same = (await tasksOf(found.activity.id)).find(item => item.status !== 'Concluído' && item.title.toLowerCase() === task.title.toLowerCase());
    if (same) return res.status(409).json({ error: `Já existe a tarefa “${same.title}” neste trabalho. Abra a tarefa e adicione mais responsáveis.` });
    const id = randomUUID();
    if (pool) {
      await pool.query(`INSERT INTO study_tasks (id,activity_id,title,description,due_date,due_time,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, found.activity.id, task.title, task.description, task.dueDate, task.dueTime, task.status, req.user.id]);
    } else mem().studyTasks.push({ id, activityId: found.activity.id, title: task.title, description: task.description, dueDate: task.dueDate, dueTime: task.dueTime, status: task.status, penalized: false, createdBy: req.user.id, createdAt: new Date(), updatedAt: new Date() });
    const added = await saveAssignees(id, task.assigneeIds);
    for (const userId of added.filter(item => item !== req.user.id)) {
      await notify(userId, { kind: 'compartilhada', key: `sala-tarefa:${id}:${userId}`, title: `Nova tarefa para você: ${task.title}`, body: found.activity.title, link: { page: 'compartilhadas', params: { id: found.activity.id } } }).catch(() => {});
    }
    return res.status(201).json(await tasksOf(found.activity.id));
  }));
  app.patch('/api/v1/shared/:id/tasks/:taskId', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const row = await taskRow(found.activity.id, req.params.taskId);
    if (!row) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    const currentIds = row.assignees.map(item => item.userId);
    // "Minha parte": cada responsável marca só a própria parte. Com todas feitas, a tarefa vai para Concluído.
    if (typeof req.body?.done === 'boolean' && Object.keys(req.body).length === 1) {
      if (!currentIds.includes(req.user.id)) return res.status(403).json({ error: 'Só quem é responsável marca a própria parte.' });
      if (pool) await pool.query('UPDATE study_task_assignees SET done=$3, done_at=CASE WHEN $3 THEN NOW() ELSE NULL END WHERE task_id=$1 AND user_id=$2', [row.id, req.user.id, req.body.done]);
      else Object.assign(mem().taskAssignees.find(item => item.taskId === row.id && item.userId === req.user.id), { done: req.body.done });
      const after = await assigneesOf([row.id]);
      const status = after.every(item => item.done) ? 'Concluído' : row.status === 'Concluído' ? 'Em andamento' : row.status === 'Pendente' && req.body.done ? 'Em andamento' : row.status;
      if (pool) await pool.query('UPDATE study_tasks SET status=$2, updated_at=NOW() WHERE id=$1', [row.id, status]);
      else Object.assign(mem().studyTasks.find(item => item.id === row.id), { status, updatedAt: new Date() });
      return res.json(await tasksOf(found.activity.id));
    }
    const activeIds = found.members.filter(item => !item.removed).map(item => item.userId);
    // Quem saiu do trabalho continua aparecendo na tarefa até alguém trocar os responsáveis.
    const { task, error } = taskInput({ title: row.title, description: row.description, dueDate: row.dueDate, dueTime: row.dueTime, status: row.status, ...req.body }, [...activeIds, ...currentIds], currentIds);
    if (error) return res.status(400).json({ error });
    if (task.assigneeIds.some(id => !currentIds.includes(id) && !activeIds.includes(id))) return res.status(400).json({ error: 'Os responsáveis precisam ser integrantes do trabalho.' });
    // Prazo novo: a penalidade volta a valer para o prazo atual.
    const resetPenalty = task.dueDate !== row.dueDate || task.dueTime !== row.dueTime;
    if (pool) {
      await pool.query(`UPDATE study_tasks SET title=$2, description=$3, due_date=$4, due_time=$5, status=$6, penalized=CASE WHEN $7 THEN FALSE ELSE penalized END, updated_at=NOW() WHERE id=$1`,
        [row.id, task.title, task.description, task.dueDate, task.dueTime, task.status, resetPenalty]);
    } else Object.assign(mem().studyTasks.find(item => item.id === row.id), { title: task.title, description: task.description, dueDate: task.dueDate, dueTime: task.dueTime, status: task.status, updatedAt: new Date() }, resetPenalty ? { penalized: false } : {});
    // Tarefa movida para Concluído no quadro: todas as partes contam como feitas.
    if (task.status === 'Concluído' && row.status !== 'Concluído') {
      if (pool) await pool.query('UPDATE study_task_assignees SET done=TRUE, done_at=COALESCE(done_at, NOW()) WHERE task_id=$1', [row.id]);
      else mem().taskAssignees.filter(item => item.taskId === row.id).forEach(item => { item.done = true; });
    }
    const added = await saveAssignees(row.id, task.assigneeIds, { resetPenalty });
    for (const userId of added.filter(item => item !== req.user.id)) {
      await notify(userId, { kind: 'compartilhada', key: `sala-tarefa:${row.id}:${userId}`, title: `Nova tarefa para você: ${task.title}`, body: found.activity.title, link: { page: 'compartilhadas', params: { id: found.activity.id } } }).catch(() => {});
    }
    return res.json(await tasksOf(found.activity.id));
  }));
  app.delete('/api/v1/shared/:id/tasks/:taskId', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    if (pool) await pool.query('DELETE FROM study_tasks WHERE id=$1 AND activity_id=$2', [req.params.taskId, found.activity.id]);
    else {
      memory.studyTasks = mem().studyTasks.filter(item => !(item.id === req.params.taskId && item.activityId === found.activity.id));
      memory.taskAssignees = mem().taskAssignees.filter(item => item.taskId !== req.params.taskId);
    }
    return res.json(await tasksOf(found.activity.id));
  }));
  // Lembrete para quem ainda não fez a sua parte: a partir de 1 dia antes do prazo, um por pessoa por tarefa a cada dia.
  app.post('/api/v1/shared/:id/tasks/:taskId/lembrete', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const row = await taskRow(found.activity.id, req.params.taskId);
    if (!row) return res.status(404).json({ error: 'Tarefa não encontrada.' });
    if (!row.assignees.length) return res.status(400).json({ error: 'Esta tarefa ainda não tem responsável.' });
    const pending = row.assignees.filter(item => !item.done && item.userId !== req.user.id);
    if (!pending.length) return res.status(400).json({ error: row.assignees.some(item => item.userId === req.user.id && !item.done) ? 'A parte que falta é sua: não dá para lembrar você mesmo.' : 'Todos já fizeram a sua parte.' });
    if (row.status === 'Concluído') return res.status(400).json({ error: 'Esta tarefa já foi concluída.' });
    const due = dueAt(row.dueDate, row.dueTime);
    if (!due) return res.status(400).json({ error: 'Defina um prazo para a tarefa antes de enviar lembretes.' });
    if (Date.now() < due - reminderWindowMs) return res.status(400).json({ error: 'Os lembretes ficam disponíveis a partir de 1 dia antes do prazo.' });
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    let sent = 0;
    for (const person of pending) {
      const ok = await notify(person.userId, {
        kind: 'compartilhada', key: `sala-lembrete:${row.id}:${req.user.id}:${person.userId}:${day}`,
        title: 'Ei, sua parte ainda está pendente! O prazo está chegando. 🧙‍♀️', body: `${row.title} · ${found.activity.title} · lembrete de ${publicName(req.user.name)}`,
        link: { page: 'compartilhadas', params: { id: found.activity.id } }
      });
      if (ok !== false) sent += 1;
    }
    return res.json({ sent: sent > 0, count: sent, names: pending.map(person => publicName(person.name)) });
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
