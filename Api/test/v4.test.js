import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { memory, pool } from '../store.js';

// Versão 4.0: pedidos do Conselho dos Bruxinhos.
export const account = async (name, extra = {}) => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123' });
  const auth = { Authorization: `Bearer ${response.body.token}` };
  if (Object.keys(extra).length) await request(app).patch('/api/v1/me').set(auth).send(extra);
  return { user: response.body.user, auth };
};

test('Cartas: papel escolhido volta na lista e papel desconhecido vira pergaminho', async () => {
  const ana = await account('Ana Papel');
  const noite = await request(app).post('/api/v1/batepapo').set(ana.auth).send({ body: 'Carta na noite', paper: 'noite' }).expect(201);
  assert.equal(noite.body.paper, 'noite');
  const estranho = await request(app).post('/api/v1/batepapo').set(ana.auth).send({ body: 'Carta qualquer', paper: '<script>' }).expect(201);
  assert.equal(estranho.body.paper, 'pergaminho');
});

test('Nome completo: perfil antigo igual ao apelido pede confirmação e a lista avisa quem falta', async () => {
  const dona = await account('Mari');
  const colega = await account('Victor Hugo');
  // Perfil salvo antes da 4.0, com o apelido no lugar do nome completo e sem confirmação.
  if (pool) {
    await request(app).get('/api/v1/sala/perfil').set(dona.auth);
    await pool.query("INSERT INTO academic_profiles (user_id, full_name, ra) VALUES ($1, 'Mari', '111')", [dona.user.id]);
  } else {
    memory.academicProfiles ||= new Map();
    memory.academicProfiles.set(dona.user.id, { fullName: 'Mari', ra: '111', hasAgency: false, agency: [] });
  }
  const antes = (await request(app).get('/api/v1/sala/perfil').set(dona.auth)).body;
  assert.equal(antes.needsReview, true);

  const work = (await request(app).post('/api/v1/shared').set(dona.auth).send({ title: 'Trabalho de nomes', dueDate: '2030-01-10' }).expect(201)).body;
  await request(app).post(`/api/v1/shared/${work.id}/members`).set(dona.auth).send({ userIds: [colega.user.id] }).expect(200);
  const lista = (await request(app).get(`/api/v1/shared/${work.id}/lista`).set(dona.auth)).body;
  assert.deepEqual(lista.pending.sort(), ['Mari', 'Victor Hugo']);

  // Confirmar o mesmo nome tira o aviso; o nome de exibição não muda.
  const confirmado = (await request(app).put('/api/v1/sala/perfil').set(dona.auth).send({ fullName: 'Mariana Souza Lima', ra: '111' }).expect(200)).body;
  assert.equal(confirmado.needsReview, false);
  assert.equal((await request(app).get('/api/v1/me').set(dona.auth)).body.name, 'Mari');
  const depois = (await request(app).get(`/api/v1/shared/${work.id}/lista`).set(dona.auth)).body;
  assert.deepEqual(depois.pending, ['Victor Hugo']);
  assert.match(depois.text, /MARIANA SOUZA LIMA — RA: 111/);
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('Caderno: foto no resumo só abre para o dono e para quem recebeu o caderno; recados avisam o dono', async () => {
  const dona = await account('Lucas Caderno');
  const amiga = await account('Tefa Amiga');
  const estranho = await account('Outro Estranho');
  const subject = (await request(app).post('/api/v1/subjects').set(dona.auth).send({ name: 'Marketing', color: '#7c5cff', schedule: [] })).body;
  const lesson = (await request(app).post('/api/v1/lessons').set(dona.auth).send({ subjectId: subject.id, date: '2026-11-16', status: 'presente', theme: 'Segmentação' }).expect(201)).body;

  await request(app).post(`/api/v1/lessons/${lesson.id}/imagens`).set(estranho.auth).send({ mime: 'image/png', data: png.toString('base64') }).expect(404);
  await request(app).post(`/api/v1/lessons/${lesson.id}/imagens`).set(dona.auth).send({ mime: 'image/png', data: Buffer.from('não é imagem').toString('base64') }).expect(400);
  const { id } = (await request(app).post(`/api/v1/lessons/${lesson.id}/imagens`).set(dona.auth).send({ mime: 'image/png', data: png.toString('base64'), width: 1, height: 1 }).expect(201)).body;
  const html = `<h2>Slides</h2><img data-img="${id}" src="https://x" onerror="alert(1)"><p>Os 4 tipos</p>`;
  const saved = (await request(app).patch(`/api/v1/lessons/${lesson.id}`).set(dona.auth).send({ annotations: html }).expect(200)).body;
  assert.equal(saved.annotations, `<h2>Slides</h2><img data-img="${id}"><p>Os 4 tipos</p>`);

  const own = await request(app).get(`/api/v1/imagens-caderno/${id}`).set(dona.auth).expect(200);
  assert.equal(own.headers['content-type'], 'image/png');
  await request(app).get(`/api/v1/imagens-caderno/${id}`).set(amiga.auth).expect(404);
  await request(app).get(`/api/v1/cadernos/${lesson.id}`).set(amiga.auth).expect(404);

  await request(app).put(`/api/v1/lessons/${lesson.id}/compartilhamento`).set(estranho.auth).send({ userIds: [estranho.user.id] }).expect(404);
  const shared = (await request(app).put(`/api/v1/lessons/${lesson.id}/compartilhamento`).set(dona.auth).send({ userIds: [amiga.user.id] }).expect(200)).body;
  assert.deepEqual(shared.people.map(person => person.id), [amiga.user.id]);
  const list = (await request(app).get('/api/v1/cadernos/compartilhados').set(amiga.auth).expect(200)).body;
  assert.equal(list[0].id, lesson.id);
  assert.equal(list[0].subjectName, 'Marketing');
  const view = (await request(app).get(`/api/v1/cadernos/${lesson.id}`).set(amiga.auth).expect(200)).body;
  assert.equal(view.mine, false);
  assert.match(view.annotations, /data-img/);
  assert.equal(view.transcript, undefined);
  await request(app).get(`/api/v1/imagens-caderno/${id}`).set(amiga.auth).expect(200);
  // Quem recebeu lê, mas não edita a aula.
  await request(app).patch(`/api/v1/lessons/${lesson.id}`).set(amiga.auth).send({ annotations: '<p>mudei</p>' }).expect(404);

  const notes = (await request(app).post(`/api/v1/cadernos/${lesson.id}/recados`).set(amiga.auth).send({ body: 'Que resumo lindo!', sticker: 'estrela' }).expect(201)).body;
  assert.equal(notes[0].sticker, 'estrela');
  await request(app).post(`/api/v1/cadernos/${lesson.id}/recados`).set(estranho.auth).send({ body: 'oi' }).expect(404);
  const bell = (await request(app).get('/api/v1/notifications').set(dona.auth)).body;
  assert.ok(JSON.stringify(bell).includes('deixou um recado no seu caderno'));

  // Tirar a amiga do compartilhamento corta o acesso.
  await request(app).put(`/api/v1/lessons/${lesson.id}/compartilhamento`).set(dona.auth).send({ userIds: [] }).expect(200);
  await request(app).get(`/api/v1/cadernos/${lesson.id}`).set(amiga.auth).expect(404);
  await request(app).get(`/api/v1/imagens-caderno/${id}`).set(amiga.auth).expect(404);
});

test('Cartas do Saber: conjunto e aula de origem são salvos; aula de outra pessoa é recusada', async () => {
  const ana = await account('Ana Cartas');
  const bia = await account('Bia Cartas');
  const subject = (await request(app).post('/api/v1/subjects').set(ana.auth).send({ name: 'Linguagem', color: '#7c5cff', schedule: [] })).body;
  const lesson = (await request(app).post('/api/v1/lessons').set(ana.auth).send({ subjectId: subject.id, date: '2026-11-17', status: 'presente' }).expect(201)).body;
  const card = (await request(app).post('/api/v1/flashcards').set(ana.auth).send({ subjectId: subject.id, front: 'O que é?', back: 'Isto.', deck: '  Figuras   de linguagem ', lessonId: lesson.id }).expect(201)).body;
  assert.equal(card.deck, 'Figuras de linguagem');
  assert.equal(card.lessonId, lesson.id);
  const biaSubject = (await request(app).post('/api/v1/subjects').set(bia.auth).send({ name: 'Outra', color: '#7c5cff', schedule: [] })).body;
  await request(app).post('/api/v1/flashcards').set(bia.auth).send({ subjectId: biaSubject.id, front: 'a?', back: 'b', lessonId: lesson.id }).expect(400);
});

test('Tarefa compartilhada: vários responsáveis, cada um marca a sua parte e só quem não fez perde XP', async () => {
  const { applyOverduePenalties } = await import('../sala.js');
  const dona = await account('Lia Grupo');
  const bia = await account('Bia Grupo');
  const caio = await account('Caio Grupo');
  const work = (await request(app).post('/api/v1/shared').set(dona.auth).send({ title: 'Seminário de Ética' }).expect(201)).body;
  await request(app).post(`/api/v1/shared/${work.id}/members`).set(dona.auth).send({ userIds: [bia.user.id, caio.user.id] }).expect(200);
  const far = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 5 * 86_400_000));
  let tasks = (await request(app).post(`/api/v1/shared/${work.id}/tasks`).set(dona.auth).send({ title: 'Slides', assigneeIds: [bia.user.id, caio.user.id], dueDate: far }).expect(201)).body;
  const task = tasks[0];
  assert.deepEqual(task.assignees.map(person => person.id), [bia.user.id, caio.user.id]);
  assert.equal(task.assignee.id, bia.user.id);
  // Tarefa igual aberta não duplica.
  await request(app).post(`/api/v1/shared/${work.id}/tasks`).set(dona.auth).send({ title: 'slides' }).expect(409);
  // Quem não é responsável não marca parte; Bia marca a dela.
  await request(app).patch(`/api/v1/shared/${work.id}/tasks/${task.id}`).set(dona.auth).send({ done: true }).expect(403);
  tasks = (await request(app).patch(`/api/v1/shared/${work.id}/tasks/${task.id}`).set(bia.auth).send({ done: true }).expect(200)).body;
  assert.equal(tasks[0].status, 'Em andamento');
  assert.deepEqual(tasks[0].assignees.map(person => person.done), [true, false]);
  // Prazo vencido, recebida com antecedência: só o Caio perde 300 XP.
  const yesterday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 86_400_000));
  if (pool) {
    await pool.query("UPDATE study_tasks SET due_date=$2, due_time='08:00' WHERE id=$1", [task.id, yesterday]);
    await pool.query("UPDATE study_task_assignees SET assigned_at=NOW() - INTERVAL '3 days' WHERE task_id=$1", [task.id]);
  } else {
    Object.assign(memory.studyTasks.find(item => item.id === task.id), { dueDate: yesterday, dueTime: '08:00' });
    memory.taskAssignees.filter(item => item.taskId === task.id).forEach(item => { item.assignedAt = new Date(Date.now() - 3 * 86_400_000); });
  }
  await applyOverduePenalties();
  const xp = async (who) => (await request(app).get('/api/v1/xp-events').set(who.auth)).body.filter(item => item.kind === 'tarefa-atrasada').length;
  assert.equal(await xp(caio), 1);
  assert.equal(await xp(bia), 0);
  // Caio terminou depois: com todas as partes feitas, a tarefa vai para Concluído.
  tasks = (await request(app).patch(`/api/v1/shared/${work.id}/tasks/${task.id}`).set(caio.auth).send({ done: true }).expect(200)).body;
  assert.equal(tasks[0].status, 'Concluído');
  // App antigo (assigneeId único) continua funcionando.
  tasks = (await request(app).patch(`/api/v1/shared/${work.id}/tasks/${task.id}`).set(dona.auth).send({ assigneeId: caio.user.id }).expect(200)).body;
  assert.deepEqual(tasks[0].assignees.map(person => person.id), [caio.user.id]);
});

test('Demandas da aula: sorteio entre presentes, rodízio, troca e falta', async () => {
  const dona = await account('Mariana Demanda');
  const victor = await account('Victor Demanda');
  const lucas = await account('Lucas Demanda');
  const fora = await account('Fora Demanda');
  const work = (await request(app).post('/api/v1/shared').set(dona.auth).send({ title: 'Grupo de Marketing' }).expect(201)).body;
  await request(app).post(`/api/v1/shared/${work.id}/members`).set(dona.auth).send({ userIds: [victor.user.id, lucas.user.id] }).expect(200);
  await request(app).get(`/api/v1/shared/${work.id}/demandas`).set(fora.auth).expect(404);
  // Sem funções cadastradas não sorteia.
  await request(app).post(`/api/v1/shared/${work.id}/demandas/aulas`).set(dona.auth).send({ date: '2026-11-18', label: 'Khan' }).expect(400);
  let state = (await request(app).put(`/api/v1/shared/${work.id}/demandas/tipos`).set(victor.auth).send({ names: ['Fotografar os slides', 'Gravar a aula', 'Registrar o conteúdo no Caderno'] }).expect(200)).body;
  assert.equal(state.duties.length, 3);
  const ids = [dona.user.id, victor.user.id, lucas.user.id];
  // Aula 1: todos presentes, cada um com uma função diferente.
  state = (await request(app).post(`/api/v1/shared/${work.id}/demandas/aulas`).set(dona.auth).send({ date: '2026-11-18', label: 'Aula do professor Khan', presentIds: ids }).expect(201)).body;
  const first = state.rounds[0];
  assert.equal(new Set(first.items.map(item => item.person.id)).size, 3);
  await request(app).post(`/api/v1/shared/${work.id}/demandas/aulas`).set(lucas.auth).send({ date: '2026-11-18', label: 'Aula do professor Khan', presentIds: ids }).expect(409);
  // Aula 2: rodízio — ninguém repete a função da aula anterior.
  state = (await request(app).post(`/api/v1/shared/${work.id}/demandas/aulas`).set(dona.auth).send({ date: '2026-11-18', label: 'Aula do professor Chade', presentIds: ids }).expect(201)).body;
  const second = state.rounds.find(round => round.label === 'Aula do professor Chade');
  for (const item of second.items) assert.notEqual(item.person.id, first.items.find(row => row.dutyId === item.dutyId).person.id);
  // Aula 3: Lucas ausente desde o começo; nenhuma função vai para ele e uma fica sem responsável.
  state = (await request(app).post(`/api/v1/shared/${work.id}/demandas/aulas`).set(dona.auth).send({ date: '2026-11-19', label: 'Khan', presentIds: [dona.user.id, victor.user.id] }).expect(201)).body;
  const third = state.rounds.find(round => round.label === 'Khan');
  assert.ok(third.items.every(item => item.person?.id !== lucas.user.id));
  assert.equal(third.items.filter(item => !item.person).length, 1);
  // Victor marca a dele como feita e depois falta: a feita continua dele; nada novo vai para ele.
  const victorItem = third.items.find(item => item.person?.id === victor.user.id);
  state = (await request(app).patch(`/api/v1/shared/${work.id}/demandas/itens/${victorItem.id}`).set(victor.auth).send({ done: true }).expect(200)).body;
  state = (await request(app).post(`/api/v1/shared/${work.id}/demandas/aulas/${third.id}/faltou`).set(dona.auth).send({ userId: victor.user.id }).expect(200)).body;
  const after = state.rounds.find(round => round.id === third.id);
  assert.equal(after.items.find(item => item.id === victorItem.id).person.id, victor.user.id);
  assert.ok(after.items.find(item => item.id === victorItem.id).done);
  assert.ok(!after.present.some(person => person.id === victor.user.id));
  // Troca só com quem está presente.
  const empty = after.items.find(item => !item.person);
  await request(app).patch(`/api/v1/shared/${work.id}/demandas/itens/${empty.id}`).set(dona.auth).send({ userId: lucas.user.id }).expect(400);
  // Falta na aula 1: a função não feita da Mariana passa para outra pessoa presente.
  const marianaItem = first.items.find(item => item.person.id === dona.user.id);
  state = (await request(app).post(`/api/v1/shared/${work.id}/demandas/aulas/${first.id}/faltou`).set(victor.auth).send({ userId: dona.user.id }).expect(200)).body;
  const reassigned = state.rounds.find(round => round.id === first.id).items.find(item => item.id === marianaItem.id);
  assert.ok(reassigned.person === null || reassigned.person.id !== dona.user.id);
  // Remover função arquiva sem apagar o histórico.
  state = (await request(app).put(`/api/v1/shared/${work.id}/demandas/tipos`).set(dona.auth).send({ names: ['Fotografar os slides'] }).expect(200)).body;
  assert.equal(state.duties.length, 1);
  assert.equal(state.rounds.find(round => round.id === first.id).items.length, 3);
});
