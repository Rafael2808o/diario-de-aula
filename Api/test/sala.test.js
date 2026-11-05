import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { memory, pool } from '../store.js';

// Muda o prazo de uma tarefa no banco de verdade ou na memória.
const setTask = async (id, fields) => {
  if (!pool) return Object.assign(memory.studyTasks.find(item => item.id === id), fields);
  const columns = { dueDate: 'due_date', dueTime: 'due_time', assignedAt: 'assigned_at' };
  const keys = Object.keys(fields);
  return pool.query(`UPDATE study_tasks SET ${keys.map((key, index) => `${columns[key]}=$${index + 2}`).join(', ')} WHERE id=$1`, [id, ...keys.map(key => fields[key])]);
};
import { applyOverduePenalties, safeUrl } from '../sala.js';

const account = async (name, extra = {}) => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123' });
  const auth = { Authorization: `Bearer ${response.body.token}` };
  if (Object.keys(extra).length) await request(app).patch('/api/v1/me').set(auth).send(extra);
  return { user: response.body.user, auth };
};
const xpOf = async who => (await request(app).get('/api/v1/progress').set(who.auth)).body.xp;
const isoDay = ms => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ms));

test('Sala: perfil acadêmico, integrantes com aviso, documento e lista com RA', async () => {
  const dona = await account('Beatriz Lima Souza');
  const colega = await account('Carlos Alberto Dias');
  const fora = await account('Diana Fora Prado');

  assert.equal((await request(app).get('/api/v1/sala/perfil').set(dona.auth)).body.done, false);
  await request(app).put('/api/v1/sala/perfil').set(dona.auth).send({ fullName: 'Beatriz Lima Souza', ra: '123456', hasAgency: true, agency: [colega.user.id] }).expect(200);
  await request(app).put('/api/v1/sala/perfil').set(colega.auth).send({ fullName: 'Carlos Alberto Dias', ra: '654321' }).expect(200);
  const perfil = (await request(app).get('/api/v1/sala/perfil').set(dona.auth)).body;
  assert.equal(perfil.done, true);
  assert.deepEqual(perfil.agency.map(item => item.id), [colega.user.id]);

  const work = (await request(app).post('/api/v1/shared').set(dona.auth).send({ title: 'Seminário de Ética', subjectName: 'Ética', dueDate: '2026-12-01', dueTime: '19:00', teamSize: 3, agency: true }).expect(201)).body;
  assert.equal(work.teamSize, 3);
  await request(app).post(`/api/v1/shared/${work.id}/members`).set(colega.auth).send({ userIds: [fora.user.id] }).expect(404);
  const withMembers = (await request(app).post(`/api/v1/shared/${work.id}/members`).set(dona.auth).send({ userIds: [colega.user.id] }).expect(200)).body;
  assert.equal(withMembers.members.length, 2);
  const alerts = (await request(app).get('/api/v1/notifications').set(colega.auth)).body.items;
  assert.ok(alerts.some(item => item.title === 'Beatriz S. te adicionou ao grupo do trabalho Seminário de Ética.'), alerts.map(item => item.title).join(' | '));

  await request(app).put(`/api/v1/shared/${work.id}/documento`).set(colega.auth).send({ url: 'javascript:alert(1)' }).expect(400);
  const doc = (await request(app).put(`/api/v1/shared/${work.id}/documento`).set(colega.auth).send({ url: 'https://docs.google.com/document/d/abc/edit' }).expect(200)).body;
  assert.equal(doc.docUrl, 'https://docs.google.com/document/d/abc/edit');
  await request(app).put(`/api/v1/shared/${work.id}/documento`).set(fora.auth).send({ url: 'https://exemplo.com' }).expect(404);

  const lista = (await request(app).get(`/api/v1/shared/${work.id}/lista`).set(dona.auth).expect(200)).body;
  assert.equal(lista.text, 'BEATRIZ LIMA SOUZA — RA: 123456\nCARLOS ALBERTO DIAS — RA: 654321');
  await request(app).get(`/api/v1/shared/${work.id}/lista`).set(fora.auth).expect(404);
  assert.equal(safeUrl('ftp://x'), null);
});

test('Sala: quadro de tarefas, lembrete a partir de 1 dia antes e -300 XP uma vez só', async () => {
  const dona = await account('Elisa Quadro Ramos');
  const resp = await account('Fabio Tarefa Nunes');
  const work = (await request(app).post('/api/v1/shared').set(dona.auth).send({ title: 'Projeto de Redes' }).expect(201)).body;
  await request(app).post(`/api/v1/shared/${work.id}/members`).set(dona.auth).send({ userIds: [resp.user.id] }).expect(200);

  const far = Date.now() + 5 * 86_400_000;
  let tasks = (await request(app).post(`/api/v1/shared/${work.id}/tasks`).set(dona.auth).send({ title: 'Topologia', assigneeId: resp.user.id, dueDate: isoDay(far), dueTime: '23:00' }).expect(201)).body;
  const task = tasks[0];
  assert.equal(task.status, 'Pendente');
  assert.equal(task.assignee.id, resp.user.id);
  await request(app).post(`/api/v1/shared/${work.id}/tasks/${task.id}/lembrete`).set(dona.auth).expect(400);

  tasks = (await request(app).patch(`/api/v1/shared/${work.id}/tasks/${task.id}`).set(resp.auth).send({ status: 'Em andamento' }).expect(200)).body;
  assert.equal(tasks[0].status, 'Em andamento');

  // O prazo chegou perto: lembrete liberado e chega com a mensagem combinada.
  const soon = Date.now() + 3 * 3600_000;
  await setTask(task.id, { dueDate: isoDay(soon), dueTime: new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(soon)) });
  await request(app).post(`/api/v1/shared/${work.id}/tasks/${task.id}/lembrete`).set(dona.auth).expect(200);
  const alerts = (await request(app).get('/api/v1/notifications').set(resp.auth)).body.items;
  assert.ok(alerts.some(item => item.title === 'Ei, sua parte ainda está pendente! O prazo está chegando. 🧙‍♀️'));

  // Passou do prazo sem concluir: -300 XP uma vez.
  const before = await xpOf(resp);
  await setTask(task.id, { assignedAt: new Date(Date.now() - 3 * 86_400_000), dueDate: isoDay(Date.now() - 86_400_000), dueTime: '10:00' });
  await applyOverduePenalties();
  await applyOverduePenalties();
  assert.equal(await xpOf(resp), before - 300);
  const events = (await request(app).get('/api/v1/xp-events').set(resp.auth)).body;
  assert.equal(events.filter(item => item.kind === 'tarefa-atrasada').length, 1);

  // Tarefa concluída nunca é penalizada; responsável que recebeu em cima da hora também não.
  const late = (await request(app).post(`/api/v1/shared/${work.id}/tasks`).set(dona.auth).send({ title: 'Relatório', assigneeId: resp.user.id, dueDate: isoDay(Date.now() - 86_400_000), dueTime: '08:00' }).expect(201)).body.find(item => item.title === 'Relatório');
  const done = (await request(app).post(`/api/v1/shared/${work.id}/tasks`).set(dona.auth).send({ title: 'Slides', assigneeId: resp.user.id, status: 'Concluído', dueDate: isoDay(Date.now() - 86_400_000), dueTime: '08:00' }).expect(201)).body.find(item => item.title === 'Slides');
  assert.ok(late && done);
  await applyOverduePenalties();
  assert.equal(await xpOf(resp), before - 300);

  tasks = (await request(app).delete(`/api/v1/shared/${work.id}/tasks/${done.id}`).set(dona.auth).expect(200)).body;
  assert.equal(tasks.some(item => item.id === done.id), false);
});

test('Sala: sinalização da chamada só entre integrantes', async () => {
  const a = await account('Gabi Chama Torres');
  const b = await account('Heitor Chama Pires');
  const fora = await account('Iris Fora Campos');
  const work = (await request(app).post('/api/v1/shared').set(a.auth).send({ title: 'Grupo de estudos' }).expect(201)).body;
  await request(app).post(`/api/v1/shared/${work.id}/members`).set(a.auth).send({ userIds: [b.user.id] }).expect(200);

  await request(app).post(`/api/v1/shared/${work.id}/chamada/entrar`).set(fora.auth).expect(404);
  await request(app).post(`/api/v1/shared/${work.id}/chamada/entrar`).set(a.auth).send({ mic: true, cam: false }).expect(200);
  const joined = (await request(app).post(`/api/v1/shared/${work.id}/chamada/entrar`).set(b.auth).send({ mic: true, cam: true }).expect(200)).body;
  assert.equal(joined.participants.length, 2);
  let poll = (await request(app).get(`/api/v1/shared/${work.id}/chamada`).set(a.auth)).body;
  assert.deepEqual(poll.signals.map(item => item.type), ['join']);
  await request(app).post(`/api/v1/shared/${work.id}/chamada/sinal`).set(a.auth).send({ to: b.user.id, type: 'offer', data: { sdp: 'v=0' } }).expect(200);
  poll = (await request(app).get(`/api/v1/shared/${work.id}/chamada`).set(b.auth)).body;
  assert.equal(poll.signals[0].type, 'offer');
  assert.equal(poll.signals[0].from, a.user.id);
  await request(app).post(`/api/v1/shared/${work.id}/chamada/sair`).set(a.auth).send({ encerrar: true }).expect(200);
  poll = (await request(app).get(`/api/v1/shared/${work.id}/chamada`).set(b.auth)).body;
  assert.equal(poll.joined, false);
  assert.equal(poll.participants.length, 0);
});
