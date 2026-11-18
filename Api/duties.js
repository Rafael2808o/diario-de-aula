import { randomInt, randomUUID } from 'node:crypto';
import { notify } from './notifications.js';
import { publicName } from './social.js';
import { initStore, memory, pool } from './store.js';
import { initShared, visibleActivity } from './shared.js';

// Demandas da aula (versão 4.0): o grupo de um trabalho da Sala de Estudos divide as funções de cada aula
// (fotografar slides, gravar, registrar no Caderno…) para ninguém fazer a mesma coisa.
// - Tipos de demanda: lista do grupo, editável por qualquer integrante. Remover só arquiva (o histórico fica).
// - Aula: data + nome livre ("Aula do professor Khan") + quem está presente. O sorteio é feito aqui no servidor.
// - Rodízio: para cada função, vai para quem está presente, ainda sem função nesta aula e que fez essa função há
//   mais tempo (ou nunca fez); empate: quem teve menos funções nas últimas aulas; depois, sorte.
//   Com mais funções do que pessoas presentes, as que sobram ficam "sem responsável" (nunca duas para a mesma pessoa).
// - "Faltou": a pessoa sai dos presentes e só as funções dela ainda não feitas são sorteadas de novo.

export const defaultDuties = ['Fotografar os slides', 'Gravar a aula', 'Registrar o conteúdo no Caderno'];
const maxDuties = 8;
const historyRounds = 12;
const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`));

let ready;
export function initDuties() {
  ready ||= (async () => {
    await initStore();
    await initShared();
    if (!pool) {
      memory.classDuties ||= [];
      memory.classRounds ||= [];
      memory.classRoundItems ||= [];
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS class_duties (
        id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES shared_activities(id) ON DELETE CASCADE,
        name TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, archived BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS class_duties_activity_idx ON class_duties(activity_id);
      CREATE TABLE IF NOT EXISTS class_rounds (
        id TEXT PRIMARY KEY, activity_id TEXT NOT NULL REFERENCES shared_activities(id) ON DELETE CASCADE,
        date TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', present_ids TEXT[] NOT NULL DEFAULT '{}',
        created_by TEXT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (activity_id, date, label));
      CREATE TABLE IF NOT EXISTS class_round_items (
        id TEXT PRIMARY KEY, round_id TEXT NOT NULL REFERENCES class_rounds(id) ON DELETE CASCADE,
        duty_id TEXT NOT NULL REFERENCES class_duties(id) ON DELETE CASCADE,
        user_id TEXT REFERENCES users(id) ON DELETE SET NULL, done BOOLEAN NOT NULL DEFAULT FALSE, done_at TIMESTAMPTZ,
        UNIQUE (round_id, duty_id));
      CREATE INDEX IF NOT EXISTS class_round_items_round_idx ON class_round_items(round_id);`);
  })();
  return ready;
}

const memoryUser = id => memory.users.find(user => user.id === id) || {};

async function dutiesOf(activityId, { all = false } = {}) {
  const rows = pool
    ? (await pool.query('SELECT id, name, position, archived FROM class_duties WHERE activity_id=$1 ORDER BY position, created_at', [activityId])).rows
    : memory.classDuties.filter(item => item.activityId === activityId).sort((a, b) => a.position - b.position);
  return rows.filter(row => all || !row.archived).map(row => ({ id: row.id, name: row.name, archived: Boolean(row.archived) }));
}

async function roundsOf(activityId, limit = historyRounds) {
  const rounds = pool
    ? (await pool.query(`SELECT id, date, label, present_ids AS "presentIds", created_by AS "createdBy", created_at AS "createdAt"
        FROM class_rounds WHERE activity_id=$1 ORDER BY date DESC, created_at DESC LIMIT $2`, [activityId, limit])).rows
    : memory.classRounds.filter(item => item.activityId === activityId).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, limit);
  const ids = rounds.map(round => round.id);
  const items = !ids.length ? [] : pool
    ? (await pool.query(`SELECT id, round_id AS "roundId", duty_id AS "dutyId", user_id AS "userId", done FROM class_round_items WHERE round_id = ANY($1)`, [ids])).rows
    : memory.classRoundItems.filter(item => ids.includes(item.roundId));
  return rounds.map(round => ({ ...round, presentIds: [...(round.presentIds || [])], items: items.filter(item => item.roundId === round.id) }));
}

// Distribui as funções entre os presentes. history: aulas anteriores (mais nova primeiro).
export function distribute(duties, presentIds, history, locked = new Map()) {
  const lastDid = new Map(); // `${user}|${duty}` -> índice da aula (0 = mais recente)
  const load = new Map(); // user -> funções nas últimas aulas
  history.forEach((round, index) => {
    for (const item of round.items) {
      if (!item.userId) continue;
      const key = `${item.userId}|${item.dutyId}`;
      if (!lastDid.has(key)) lastDid.set(key, index);
      load.set(item.userId, (load.get(item.userId) || 0) + 1);
    }
  });
  const order = [...duties];
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const busy = new Set(locked.values());
  const result = new Map(locked);
  for (const duty of order) {
    if (result.has(duty.id)) continue;
    const candidates = presentIds.filter(id => !busy.has(id)).map(id => ({
      id,
      // Nunca fez: vem antes de todos. Fez há mais tempo: índice maior.
      since: lastDid.has(`${id}|${duty.id}`) ? lastDid.get(`${id}|${duty.id}`) : Number.MAX_SAFE_INTEGER,
      load: load.get(id) || 0,
      luck: randomInt(1_000_000)
    }));
    candidates.sort((a, b) => b.since - a.since || a.load - b.load || a.luck - b.luck);
    const chosen = candidates[0]?.id || null;
    result.set(duty.id, chosen);
    if (chosen) busy.add(chosen);
  }
  return result;
}

async function peopleMap(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = pool
    ? (await pool.query('SELECT id, name, avatar_version AS "avatarVersion" FROM users WHERE id = ANY($1)', [unique])).rows
    : unique.map(id => ({ id, name: memoryUser(id).name || '', avatarVersion: memoryUser(id).avatar_version || '' }));
  return new Map(rows.map(row => [row.id, { id: row.id, name: publicName(row.name || ''), avatarVersion: row.avatarVersion || '' }]));
}

async function view(activityId, userId) {
  const duties = await dutiesOf(activityId, { all: true });
  const rounds = await roundsOf(activityId, 6);
  const people = await peopleMap(rounds.flatMap(round => [...round.presentIds, ...round.items.map(item => item.userId)]));
  const dutyName = new Map(duties.map(duty => [duty.id, duty.name]));
  return {
    duties: duties.filter(duty => !duty.archived),
    rounds: rounds.map(round => ({
      id: round.id, date: round.date, label: round.label,
      present: round.presentIds.map(id => people.get(id)).filter(Boolean),
      items: round.items
        .map(item => ({ id: item.id, dutyId: item.dutyId, duty: dutyName.get(item.dutyId) || 'Função', person: item.userId ? people.get(item.userId) || null : null, done: Boolean(item.done), mine: item.userId === userId }))
        .sort((a, b) => duties.findIndex(duty => duty.id === a.dutyId) - duties.findIndex(duty => duty.id === b.dutyId))
    }))
  };
}

async function saveItem(item) {
  if (pool) {
    await pool.query(`INSERT INTO class_round_items (id, round_id, duty_id, user_id, done) VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (round_id, duty_id) DO UPDATE SET user_id=EXCLUDED.user_id, done=EXCLUDED.done, done_at=CASE WHEN EXCLUDED.done THEN COALESCE(class_round_items.done_at, NOW()) ELSE NULL END`,
    [item.id, item.roundId, item.dutyId, item.userId, item.done]);
  } else {
    const found = memory.classRoundItems.find(row => row.roundId === item.roundId && row.dutyId === item.dutyId);
    if (found) Object.assign(found, { userId: item.userId, done: item.done });
    else memory.classRoundItems.push({ ...item });
  }
}

const tellAssigned = (round, items, activity, by) => Promise.all(items.filter(item => item.userId && item.userId !== by).map(item =>
  notify(item.userId, {
    kind: 'compartilhada', key: `demanda:${round.id}:${item.userId}`,
    title: `Sua função na aula: ${item.dutyName}`,
    body: `${round.label || 'Aula'} · ${activity.title}`,
    link: { page: 'compartilhadas', params: { id: activity.id } }
  }).catch(() => {})));

export function registerDutyRoutes(app, requireAuth) {
  const route = action => async (req, res, next) => {
    try {
      await initDuties();
      await action(req, res);
    } catch (error) {
      next(error);
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
  const activeIds = found => found.members.filter(item => !item.removed).map(item => item.userId);
  const roundOf = async (activityId, roundId) => (await roundsOf(activityId, 500)).find(round => round.id === roundId) || null;

  app.get('/api/v1/shared/:id/demandas', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    return res.json({ ...(await view(found.activity.id, req.user.id)), suggestions: defaultDuties });
  }));

  // Lista de funções do grupo (nomes na ordem). Nome que saiu é arquivado; nome que volta é reativado.
  app.put('/api/v1/shared/:id/demandas/tipos', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const names = [];
    for (const raw of Array.isArray(req.body?.names) ? req.body.names : []) {
      const name = oneLine(raw, 60);
      if (name.length >= 2 && !names.some(item => item.toLowerCase() === name.toLowerCase())) names.push(name);
    }
    if (names.length > maxDuties) return res.status(400).json({ error: `Use no máximo ${maxDuties} funções por aula.` });
    const current = await dutiesOf(found.activity.id, { all: true });
    for (const [position, name] of names.entries()) {
      const existing = current.find(duty => duty.name.toLowerCase() === name.toLowerCase());
      if (pool) {
        if (existing) await pool.query('UPDATE class_duties SET name=$2, position=$3, archived=FALSE WHERE id=$1', [existing.id, name, position]);
        else await pool.query('INSERT INTO class_duties (id, activity_id, name, position) VALUES ($1,$2,$3,$4)', [randomUUID(), found.activity.id, name, position]);
      } else if (existing) Object.assign(memory.classDuties.find(duty => duty.id === existing.id), { name, position, archived: false });
      else memory.classDuties.push({ id: randomUUID(), activityId: found.activity.id, name, position, archived: false });
    }
    for (const duty of current.filter(item => !names.some(name => name.toLowerCase() === item.name.toLowerCase()))) {
      if (pool) await pool.query('UPDATE class_duties SET archived=TRUE WHERE id=$1', [duty.id]);
      else Object.assign(memory.classDuties.find(item => item.id === duty.id), { archived: true });
    }
    return res.json({ ...(await view(found.activity.id, req.user.id)), suggestions: defaultDuties });
  }));

  // Nova aula: sorteia as funções entre os presentes.
  app.post('/api/v1/shared/:id/demandas/aulas', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    if (found.activity.closed) return res.status(409).json({ error: 'Este trabalho foi encerrado.' });
    const date = oneLine(req.body?.date, 10);
    const label = oneLine(req.body?.label, 80);
    if (!isDate(date)) return res.status(400).json({ error: 'Escolha a data da aula.' });
    const members = activeIds(found);
    const presentIds = [...new Set((Array.isArray(req.body?.presentIds) ? req.body.presentIds : members).map(String))];
    if (presentIds.some(id => !members.includes(id))) return res.status(400).json({ error: 'Só integrantes do trabalho podem estar na lista de presença.' });
    if (!presentIds.length) return res.status(400).json({ error: 'Marque quem está presente na aula.' });
    const duties = await dutiesOf(found.activity.id);
    if (!duties.length) return res.status(400).json({ error: 'Cadastre as funções do grupo antes de sortear.' });
    const round = { id: randomUUID(), activityId: found.activity.id, date, label, presentIds, createdBy: req.user.id, createdAt: new Date() };
    if (pool) {
      const inserted = await pool.query(`INSERT INTO class_rounds (id, activity_id, date, label, present_ids, created_by) VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (activity_id, date, label) DO NOTHING RETURNING id`, [round.id, round.activityId, date, label, presentIds, req.user.id]);
      if (!inserted.rows.length) return res.status(409).json({ error: 'Esta aula já foi sorteada. Veja a distribuição abaixo.' });
    } else {
      if (memory.classRounds.some(item => item.activityId === round.activityId && item.date === date && item.label === label)) return res.status(409).json({ error: 'Esta aula já foi sorteada. Veja a distribuição abaixo.' });
      memory.classRounds.push(round);
    }
    const history = (await roundsOf(found.activity.id)).filter(item => item.id !== round.id);
    const plan = distribute(duties, presentIds, history);
    const items = duties.map(duty => ({ id: randomUUID(), roundId: round.id, dutyId: duty.id, userId: plan.get(duty.id) || null, done: false, dutyName: duty.name }));
    for (const item of items) await saveItem(item);
    await tellAssigned(round, items, found.activity, req.user.id);
    return res.status(201).json({ ...(await view(found.activity.id, req.user.id)), suggestions: defaultDuties });
  }));

  // Marcar feito, trocar responsável (por alguém presente) ou desfazer.
  app.patch('/api/v1/shared/:id/demandas/itens/:itemId', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const rounds = await roundsOf(found.activity.id, 500);
    const round = rounds.find(item => item.items.some(row => row.id === req.params.itemId));
    if (!round) return res.status(404).json({ error: 'Função não encontrada.' });
    const item = round.items.find(row => row.id === req.params.itemId);
    const next = { ...item };
    if (typeof req.body?.done === 'boolean') next.done = req.body.done;
    if (req.body?.userId !== undefined) {
      const userId = req.body.userId ? String(req.body.userId) : null;
      if (userId && !round.presentIds.includes(userId)) return res.status(400).json({ error: 'Escolha alguém que está presente nesta aula.' });
      // Troca: se a pessoa escolhida já tinha outra função, as duas trocam de lugar.
      const other = userId && round.items.find(row => row.userId === userId && row.id !== item.id);
      if (other) await saveItem({ ...other, userId: item.userId, done: false });
      next.userId = userId;
      next.done = false;
      if (userId && userId !== req.user.id) {
        const duty = (await dutiesOf(found.activity.id, { all: true })).find(row => row.id === item.dutyId);
        await notify(userId, { kind: 'compartilhada', key: `demanda-troca:${item.id}:${userId}`, title: `Sua função na aula: ${duty?.name || 'nova função'}`, body: `${round.label || 'Aula'} · ${found.activity.title}`, link: { page: 'compartilhadas', params: { id: found.activity.id } } }).catch(() => {});
      }
    }
    await saveItem(next);
    return res.json({ ...(await view(found.activity.id, req.user.id)), suggestions: defaultDuties });
  }));

  // Faltou: sai dos presentes e só as funções dela ainda não feitas vão para outra pessoa.
  app.post('/api/v1/shared/:id/demandas/aulas/:roundId/faltou', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const round = await roundOf(found.activity.id, req.params.roundId);
    if (!round) return res.status(404).json({ error: 'Aula não encontrada.' });
    const userId = String(req.body?.userId || '');
    if (!round.presentIds.includes(userId)) return res.status(400).json({ error: 'Esta pessoa já não está na lista de presença.' });
    const presentIds = round.presentIds.filter(id => id !== userId);
    if (pool) await pool.query('UPDATE class_rounds SET present_ids=$2 WHERE id=$1', [round.id, presentIds]);
    else Object.assign(memory.classRounds.find(item => item.id === round.id), { presentIds });
    const reopen = round.items.filter(item => item.userId === userId && !item.done);
    const locked = new Map(round.items.filter(item => item.userId && item.userId !== userId).map(item => [item.dutyId, item.userId]));
    const duties = (await dutiesOf(found.activity.id, { all: true })).filter(duty => reopen.some(item => item.dutyId === duty.id));
    const history = (await roundsOf(found.activity.id)).filter(item => item.id !== round.id);
    const plan = distribute(duties, presentIds, history, locked);
    const changed = reopen.map(item => ({ ...item, userId: plan.get(item.dutyId) || null, done: false, dutyName: duties.find(duty => duty.id === item.dutyId)?.name || 'Função' }));
    // Função já feita por quem faltou fica registrada como feita.
    for (const item of changed) await saveItem(item);
    await tellAssigned({ ...round, id: `${round.id}:${userId}` }, changed, found.activity, req.user.id);
    return res.json({ ...(await view(found.activity.id, req.user.id)), suggestions: defaultDuties });
  }));

  app.delete('/api/v1/shared/:id/demandas/aulas/:roundId', requireAuth, route(async (req, res) => {
    const found = await member(req, res);
    if (!found) return undefined;
    const round = await roundOf(found.activity.id, req.params.roundId);
    if (!round) return res.status(404).json({ error: 'Aula não encontrada.' });
    if (round.createdBy !== req.user.id && found.activity.ownerId !== req.user.id) return res.status(403).json({ error: 'Só quem sorteou ou quem cadastrou o trabalho apaga a aula.' });
    if (pool) await pool.query('DELETE FROM class_rounds WHERE id=$1', [round.id]);
    else {
      memory.classRounds = memory.classRounds.filter(item => item.id !== round.id);
      memory.classRoundItems = memory.classRoundItems.filter(item => item.roundId !== round.id);
    }
    return res.json({ ...(await view(found.activity.id, req.user.id)), suggestions: defaultDuties });
  }));
}
