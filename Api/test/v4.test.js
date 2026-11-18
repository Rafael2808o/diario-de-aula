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
