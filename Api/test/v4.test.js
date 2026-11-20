import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { memory, pool } from '../store.js';

// Versão 4.0: pedidos do Conselho dos Bruxinhos.
import { account } from './helpers.js';
export { account };

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

test('Ritual em grupo: sala com código, pulso com estado, chat, bloco do grupo e saída', async () => {
  const ana = await account('Ana Foco');
  const beto = await account('Beto Foco');
  const intruso = await account('Intruso Foco');
  await request(app).post('/api/v1/foco/salas').set(ana.auth).send({ name: 'x' }).expect(400);
  let room = (await request(app).post('/api/v1/foco/salas').set(ana.auth).send({ name: 'Turma da noite' }).expect(201)).body;
  assert.match(room.code, /^[A-Z2-9]{6}$/);
  await request(app).get(`/api/v1/foco/salas/${room.id}`).set(intruso.auth).expect(404);
  await request(app).post('/api/v1/foco/salas/entrar').set(beto.auth).send({ code: 'NADA00' }).expect(404);
  room = (await request(app).post('/api/v1/foco/salas/entrar').set(beto.auth).send({ code: room.code.toLowerCase() }).expect(200)).body;
  assert.equal(room.people.length, 2);
  assert.ok(room.people.every(person => !person.online));
  // Pulso: Ana focando em Marketing aparece para o Beto; data no futuro é ignorada.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  await request(app).post(`/api/v1/foco/salas/${room.id}/pulso`).set(ana.auth).send({ state: 'focando', subject: 'Marketing', since }).expect(200);
  room = (await request(app).post(`/api/v1/foco/salas/${room.id}/pulso`).set(beto.auth).send({ state: 'qualquer', since: new Date(Date.now() + 3600_000).toISOString() }).expect(200)).body;
  const ana2 = room.people.find(person => person.name.startsWith('Ana'));
  assert.equal(ana2.state, 'focando');
  assert.equal(ana2.subject, 'Marketing');
  assert.equal(ana2.since, since);
  assert.equal(room.people.find(person => person.me).state, 'presente');
  assert.equal(room.people.find(person => person.me).since, null);
  // Chat e bloco.
  await request(app).post(`/api/v1/foco/salas/${room.id}/mensagens`).set(beto.auth).send({ body: '   ' }).expect(400);
  room = (await request(app).post(`/api/v1/foco/salas/${room.id}/mensagens`).set(beto.auth).send({ body: 'Bora estudar!' }).expect(201)).body;
  assert.equal(room.messages.at(-1).body, 'Bora estudar!');
  await request(app).post(`/api/v1/foco/salas/${room.id}/bloco`).set(ana.auth).send({ minutes: 30 }).expect(400);
  room = (await request(app).post(`/api/v1/foco/salas/${room.id}/bloco`).set(ana.auth).send({ minutes: 25 }).expect(200)).body;
  assert.equal(room.block.minutes, 25);
  assert.ok(room.messages.at(-1).system);
  const after = room.messages.at(-1).createdAt;
  room = (await request(app).get(`/api/v1/foco/salas/${room.id}?after=${encodeURIComponent(after)}`).set(beto.auth).expect(200)).body;
  assert.equal(room.messages.length, 0);
  // Convite avisa; sair; o último a sair apaga a sala.
  room = (await request(app).post(`/api/v1/foco/salas/${room.id}/convidar`).set(ana.auth).send({ userIds: [intruso.user.id] }).expect(200)).body;
  assert.equal(room.people.length, 3);
  const alerts = (await request(app).get('/api/v1/notifications').set(intruso.auth)).body.items;
  assert.ok(alerts.some(item => item.kind === 'foco'));
  for (const who of [ana, beto, intruso]) await request(app).post(`/api/v1/foco/salas/${room.id}/sair`).set(who.auth).expect(200);
  await request(app).get(`/api/v1/foco/salas/${room.id}`).set(ana.auth).expect(404);
  assert.equal((await request(app).get('/api/v1/foco/salas').set(ana.auth)).body.length, 0);
});

test('Perguntados: gabarito escondido, tempo medido no servidor, pontos, vencedor e XP com limite', async () => {
  const { setQuestionGenerator } = await import('../quizgame.js');
  const fake = Array.from({ length: 5 }, (_, n) => ({ question: `Pergunta ${n + 1} sobre segmentação`, options: [`certa ${n}`, `errada a ${n}`, `errada b ${n}`, `errada c ${n}`], correctIndex: 0, explanation: `Explicação ${n}`, difficulty: 'Média' }));
  setQuestionGenerator(async input => ({ title: 'x', questions: fake.slice(0, input.quantity) }));
  try {
    const ana = await account('Ana Perguntados');
    const caio = await account('Caio Perguntados');
    const context = 'Segmentação de mercado divide consumidores em grupos. '.repeat(10);
    await request(app).post('/api/v1/perguntados').set(ana.auth).send({ subject: 'Marketing', context: 'pouco', userIds: [caio.user.id] }).expect(400);
    await request(app).post('/api/v1/perguntados').set(ana.auth).send({ subject: 'Marketing', context, userIds: [] }).expect(400);
    let match = (await request(app).post('/api/v1/perguntados').set(ana.auth).send({ subject: 'Marketing', topic: 'Segmentação', context, quantity: 5, userIds: [caio.user.id] }).expect(202)).body;
    match = (await request(app).get(`/api/v1/perguntados/${match.id}`).set(caio.auth).expect(200)).body;
    assert.equal(match.status, 'aberta');
    assert.equal(match.total, 5);
    const invites = (await request(app).get('/api/v1/notifications').set(caio.auth)).body.items;
    assert.ok(invites.some(item => item.kind === 'perguntados'));
    // A pergunta chega sem gabarito; pedir de novo não reinicia o relógio.
    const first = (await request(app).post(`/api/v1/perguntados/${match.id}/pergunta`).set(ana.auth).expect(200)).body;
    assert.equal(first.correctIndex, undefined);
    assert.equal(first.options.length, 4);
    const again = (await request(app).post(`/api/v1/perguntados/${match.id}/pergunta`).set(ana.auth).expect(200)).body;
    assert.ok(again.leftMs <= first.leftMs);
    // Ana acerta tudo rápido.
    for (let n = 0; n < 5; n += 1) {
      const question = (await request(app).post(`/api/v1/perguntados/${match.id}/pergunta`).set(ana.auth).expect(200)).body;
      const right = question.options.findIndex(option => option.startsWith('certa'));
      const answer = (await request(app).post(`/api/v1/perguntados/${match.id}/resposta`).set(ana.auth).send({ index: question.index, choice: right }).expect(200)).body;
      assert.ok(answer.correct);
      assert.ok(answer.points >= 140);
    }
    await request(app).post(`/api/v1/perguntados/${match.id}/resposta`).set(ana.auth).send({ index: 0, choice: 0 }).expect(409);
    // Placar da Ana escondido do Caio até ele terminar.
    match = (await request(app).get(`/api/v1/perguntados/${match.id}`).set(caio.auth)).body;
    assert.equal(match.players.find(player => !player.me).score, undefined);
    // Caio: erra uma, deixa uma estourar o tempo, acerta o resto.
    for (let n = 0; n < 5; n += 1) {
      const question = (await request(app).post(`/api/v1/perguntados/${match.id}/pergunta`).set(caio.auth).expect(200)).body;
      const right = question.options.findIndex(option => option.startsWith('certa'));
      if (n === 1) {
        const late = new Date(Date.now() - 60_000);
        if (pool) await pool.query('UPDATE quiz_players SET served_at=$3 WHERE match_id=$1 AND user_id=$2', [match.id, caio.user.id, late]);
        else memory.quizPlayers.find(item => item.matchId === match.id && item.userId === caio.user.id).servedAt = late;
      }
      const answer = (await request(app).post(`/api/v1/perguntados/${match.id}/resposta`).set(caio.auth).send({ index: question.index, choice: n === 0 ? (right + 1) % 4 : right }).expect(200)).body;
      if (n === 0) assert.equal(answer.points, -25);
      if (n === 1) { assert.ok(answer.late); assert.equal(answer.points, 0); }
    }
    match = (await request(app).get(`/api/v1/perguntados/${match.id}`).set(caio.auth)).body;
    assert.equal(match.status, 'encerrada');
    assert.equal(match.winner.id, ana.user.id);
    assert.equal(match.review.length, 5);
    assert.equal(match.review[0].correct, false);
    const xpKinds = async who => (await request(app).get('/api/v1/xp-events').set(who.auth)).body.map(item => item.kind);
    assert.ok((await xpKinds(ana)).includes('perguntados-vitoria'));
    assert.ok((await xpKinds(caio)).includes('perguntados-partida'));
    const ranking = (await request(app).get('/api/v1/perguntados/ranking').set(caio.auth)).body;
    assert.equal(ranking.items.find(item => item.id === ana.user.id).wins, 1);
    // Limite: no máximo 3 partidas com XP por dia.
    for (let round = 0; round < 3; round += 1) {
      const extra = (await request(app).post('/api/v1/perguntados').set(ana.auth).send({ subject: 'Marketing', context, quantity: 5, userIds: [caio.user.id] }).expect(202)).body;
      for (const who of [ana, caio]) {
        for (let n = 0; n < 5; n += 1) {
          const question = (await request(app).post(`/api/v1/perguntados/${extra.id}/pergunta`).set(who.auth).expect(200)).body;
          await request(app).post(`/api/v1/perguntados/${extra.id}/resposta`).set(who.auth).send({ index: question.index, choice: 0 }).expect(200);
        }
      }
    }
    assert.equal((await xpKinds(ana)).filter(kind => kind.startsWith('perguntados-')).length, 3);
  } finally {
    setQuestionGenerator(null);
  }
});

test('Apresentação do perfil: campos validados, mais estudado calculado, capa e opção de esconder', async () => {
  const bia = await account('Bia Vitrine');
  const leo = await account('Leo Vitrine');
  const subject = (await request(app).post('/api/v1/subjects').set(bia.auth).send({ name: 'Semiótica', color: '#7c5cff', schedule: [] }).expect(201)).body;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  await request(app).post('/api/v1/study-sessions').set(bia.auth).send({ clientId: 'vitrine-1', subjectId: subject.id, date: today, durationSeconds: 3000, topic: 'Signo e símbolo' }).expect(201);
  await request(app).put('/api/v1/vitrine').set(bia.auth).send({ musicUrl: 'javascript:alert(1)' }).expect(400);
  let mine = (await request(app).put('/api/v1/vitrine').set(bia.auth).send({ accent: '#e07fa8', coverTheme: 'aurora', headline: 'Estudante de PP', musicTitle: 'Lo-fi', musicUrl: 'https://open.spotify.com/playlist/abc', readingTitle: 'O Pequeno Príncipe', favoriteSubject: 'Semiótica', accentX: 1 }).expect(200)).body;
  assert.equal(mine.accent, '#e07fa8');
  assert.equal(mine.mostStudied.subject.name, 'Semiótica');
  assert.equal(mine.mostStudied.topic.name, 'Signo e símbolo');
  await request(app).put('/api/v1/vitrine').set(bia.auth).send({ accent: 'red' }).expect(200).then(r => assert.equal(r.body.accent, ''));
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64').toString('base64');
  await request(app).put('/api/v1/vitrine/capa').set(bia.auth).send({ mime: 'text/html', data: png }).expect(400);
  await request(app).put('/api/v1/vitrine/capa').set(bia.auth).send({ mime: 'image/png', data: png }).expect(200);
  const seen = (await request(app).get(`/api/v1/vitrine/${bia.user.id}`).set(leo.auth).expect(200)).body;
  assert.equal(seen.readingTitle, 'O Pequeno Príncipe');
  assert.equal(seen.email, undefined);
  assert.ok(seen.coverVersion);
  await request(app).get(`/api/v1/vitrine/capa/${bia.user.id}`).set(leo.auth).expect(200);
  // Escondida: só nome e foto.
  await request(app).put('/api/v1/vitrine').set(bia.auth).send({ visible: false }).expect(200);
  const hidden = (await request(app).get(`/api/v1/vitrine/${bia.user.id}`).set(leo.auth).expect(200)).body;
  assert.equal(hidden.hidden, true);
  assert.equal(hidden.readingTitle, undefined);
  await request(app).get(`/api/v1/vitrine/capa/${bia.user.id}`).set(leo.auth).expect(404);
});

test('Loja da Madrugada: pozinho separado do XP, compra trava o saldo, só equipa o que comprou', async () => {
  const bia = await account('Bia Loja');
  const outra = await account('Outra Loja');
  const start = (await request(app).get('/api/v1/loja').set(bia.auth).expect(200)).body;
  assert.equal(start.wallet.balance, 200, 'conta nova começa com 200 de boas-vindas');
  assert.ok(start.items.some(item => item.id === 'moldura-lua'));
  const poor = await request(app).post('/api/v1/loja/moldura-lua/comprar').set(bia.auth).expect(400);
  assert.match(poor.body.error, /Faltam 300/);
  // 20 aulas registradas = 400 XP novo = 400 de pozinho.
  const subject = (await request(app).post('/api/v1/subjects').set(bia.auth).send({ name: 'Loja', color: '#7c5cff', schedule: [] })).body;
  for (let day = 1; day <= 20; day += 1) {
    await request(app).post('/api/v1/lessons').set(bia.auth).send({ subjectId: subject.id, date: `2026-10-${String(day).padStart(2, '0')}`, status: 'presente', theme: `Aula ${day}`, annotations: '<p>Conteúdo</p>' }).expect(201);
  }
  const rich = (await request(app).get('/api/v1/loja').set(bia.auth)).body.wallet;
  assert.equal(rich.balance, 600);
  const bought = await request(app).post('/api/v1/loja/moldura-lua/comprar').set(bia.auth).expect(201);
  assert.equal(bought.body.wallet.balance, 100);
  assert.deepEqual(bought.body.wallet.owned, ['moldura-lua']);
  assert.equal((await request(app).get('/api/v1/progress').set(bia.auth)).body.xp, 400, 'comprar não tira XP');
  await request(app).post('/api/v1/loja/moldura-lua/comprar').set(bia.auth).expect(409);
  await request(app).put('/api/v1/loja/equipar').set(bia.auth).send({ frame: 'moldura-sol' }).expect(403);
  await request(app).put('/api/v1/loja/equipar').set(bia.auth).send({ appColor: 'brasa' }).expect(403);
  await request(app).put('/api/v1/loja/equipar').set(bia.auth).send({ frame: 'moldura-lua' }).expect(200);
  const frames = (await request(app).get(`/api/v1/loja/molduras?ids=${bia.user.id},${outra.user.id}`).set(outra.auth).expect(200)).body;
  assert.deepEqual(frames, { [bia.user.id]: 'lua' });
});

test('Administração: só admin entra, relato vira triagem, suspensão bloqueia e fica no registro', async () => {
  const admin = await account('Ada Painel');
  const tag = Math.random().toString(36).slice(2, 7);
  const aluno = await account(`Aluno Painel ${tag}`);
  await request(app).get('/api/v1/admin/resumo').set(admin.auth).expect(403);
  process.env.ADMIN_EMAILS = admin.user.email;
  try {
    await request(app).get('/api/v1/admin/resumo').set(aluno.auth).expect(403);
    await request(app).post('/api/v1/relatos').set(aluno.auth).send({ title: 'ok' }).expect(400);
    const report = await request(app).post('/api/v1/relatos').set(aluno.auth).send({ title: 'Foto do caderno não aparece', description: 'Colei e sumiu', page: 'caderno' }).expect(201);
    const summary = (await request(app).get('/api/v1/admin/resumo').set(admin.auth).expect(200)).body;
    assert.ok(summary.people >= 2);
    assert.ok(summary.reports.open >= 1);
    await request(app).patch(`/api/v1/admin/relatos/${report.body.id}`).set(admin.auth).send({ severity: 'alta', status: 'em-andamento' }).expect(200);
    const list = (await request(app).get('/api/v1/admin/relatos').set(admin.auth)).body;
    assert.equal(list.find(item => item.id === report.body.id).severity, 'alta');
    const users = (await request(app).get(`/api/v1/admin/usuarios?q=Aluno Painel ${tag}`).set(admin.auth).expect(200)).body;
    assert.equal(users[0].email, aluno.user.email);
    await request(app).post(`/api/v1/admin/usuarios/${admin.user.id}/suspensao`).set(admin.auth).send({ suspend: true, reason: 'x' }).expect(400);
    await request(app).post(`/api/v1/admin/usuarios/${aluno.user.id}/suspensao`).set(admin.auth).send({ suspend: true }).expect(400);
    await request(app).post(`/api/v1/admin/usuarios/${aluno.user.id}/suspensao`).set(admin.auth).send({ suspend: true, reason: 'Spam no Feed' }).expect(200);
    await request(app).get('/api/v1/progress').set(aluno.auth).expect(401);
    const login = await request(app).post('/api/v1/auth/login').send({ email: aluno.user.email, password: 'senha-segura-123' }).expect(403);
    assert.equal(login.body.suspended, true);
    await request(app).post(`/api/v1/admin/usuarios/${aluno.user.id}/suspensao`).set(admin.auth).send({ suspend: false }).expect(200);
    const back = await request(app).post('/api/v1/auth/login').send({ email: aluno.user.email, password: 'senha-segura-123' }).expect(200);
    aluno.auth = { Authorization: `Bearer ${back.body.token}` };
    await request(app).patch('/api/v1/admin/loja/moldura-sol').set(admin.auth).send({ price: 10 }).expect(400);
    await request(app).patch('/api/v1/admin/loja/moldura-sol').set(admin.auth).send({ price: 750, published: false }).expect(200);
    const shop = (await request(app).get('/api/v1/loja').set(aluno.auth)).body.items;
    assert.ok(!shop.some(item => item.id === 'moldura-sol'), 'item em rascunho some da loja');
    await request(app).patch('/api/v1/admin/loja/moldura-sol').set(admin.auth).send({ price: 800, published: true }).expect(200);
    const log = (await request(app).get('/api/v1/admin/auditoria').set(admin.auth)).body;
    assert.ok(log.some(item => item.action === 'suspendeu conta' && item.detail === 'Spam no Feed'));
    // E-mail nunca aparece em rota pública.
    const ranking = JSON.stringify((await request(app).get('/api/v1/ranking').set(admin.auth)).body);
    assert.ok(!ranking.includes(aluno.user.email));
  } finally {
    delete process.env.ADMIN_EMAILS;
  }
});
