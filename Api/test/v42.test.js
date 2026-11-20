import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { account } from './v4.test.js';
import { stillShown } from '../events.js';

// Versão 4.2: tópicos, dúvidas e figurinhas do Caderno; vibe e "disponível" do perfil; Eventos da Comunidade.
const lessonOf = async owner => {
  const subject = await request(app).post('/api/v1/subjects').set(owner.auth).send({ name: 'Marketing', color: '#6f8cf6' }).expect(201);
  const lesson = await request(app).post('/api/v1/lessons').set(owner.auth).send({ subjectId: subject.body.id, date: '2026-11-16', startTime: '19:00' }).expect(201);
  return lesson.body;
};
const inDays = days => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + days * 86_400_000));

test('Caderno: tópicos, dúvidas e figurinhas são salvos por parte, limpos e só o dono edita', async () => {
  const dona = await account('Dona Caderno');
  const colega = await account('Colega Caderno');
  const lesson = await lessonOf(dona);
  const empty = await request(app).get(`/api/v1/lessons/${lesson.id}/extras`).set(dona.auth).expect(200);
  assert.deepEqual(empty.body, { topics: [], doubts: [], stickers: [] });

  const saved = await request(app).put(`/api/v1/lessons/${lesson.id}/extras`).set(dona.auth).send({
    topics: [{ id: 't1', t: '  Os 4 tipos  ', f: true, d: false }, { id: 't2', t: '' }],
    stickers: [
      { id: 's1', k: 'lua', p: 'L', sec: 'conteudo', x: 2, y: -5, s: 999, r: 90, z: 3, sh: true },
      { id: 's2', k: '<script>', p: 'R', x: 0.5, y: 10 }
    ]
  }).expect(200);
  assert.deepEqual(saved.body.topics, [{ id: 't1', t: 'Os 4 tipos', f: true, d: false }]);
  assert.equal(saved.body.stickers.length, 1);
  assert.deepEqual(saved.body.stickers[0], { id: 's1', k: 'lua', p: 'L', sec: 'conteudo', x: 1, y: 0, s: 220, r: 45, z: 3, sh: true });

  // Só as dúvidas mudam; tópicos e figurinhas ficam como estavam.
  const doubts = await request(app).put(`/api/v1/lessons/${lesson.id}/extras`).set(dona.auth).send({ doubts: [{ id: 'd1', t: 'Persona é segmento?' }] }).expect(200);
  assert.equal(doubts.body.topics.length, 1);
  assert.equal(doubts.body.stickers.length, 1);
  assert.deepEqual(doubts.body.doubts, [{ id: 'd1', t: 'Persona é segmento?', d: false }]);

  await request(app).put(`/api/v1/lessons/${lesson.id}/extras`).set(colega.auth).send({ topics: [] }).expect(404);
  await request(app).get(`/api/v1/lessons/${lesson.id}/extras`).set(colega.auth).expect(404);

  // Quem recebe o caderno vê os extras (só leitura).
  await request(app).put(`/api/v1/lessons/${lesson.id}/compartilhamento`).set(dona.auth).send({ userIds: [colega.user.id] }).expect(200);
  const shared = await request(app).get(`/api/v1/cadernos/${lesson.id}`).set(colega.auth).expect(200);
  assert.equal(shared.body.extras.stickers[0].k, 'lua');
  assert.equal(shared.body.extras.doubts[0].t, 'Persona é segmento?');
});

test('Perfil: vibe vale 24 horas, "disponível" aparece em Bruxinhos e vibe estranha é ignorada', async () => {
  const mari = await account('Mari Vibe');
  const vibe = await request(app).put('/api/v1/vitrine/vibe').set(mari.auth).send({ vibe: 'focada' }).expect(200);
  assert.equal(vibe.body.vibe, 'focada');
  const showcase = await request(app).put('/api/v1/vitrine').set(mari.auth).send({ available: true, headline: 'Oi' }).expect(200);
  assert.equal(showcase.body.available, true);
  assert.equal(showcase.body.vibe, 'focada');
  assert.ok(showcase.body.vibes.includes('cansada'));
  await request(app).post('/api/v1/presence/heartbeat').set(mari.auth).expect(204);
  const members = await request(app).get('/api/v1/community/members').set(mari.auth).expect(200);
  const me = members.body.items.find(item => item.id === mari.user.id);
  assert.equal(me.vibe, 'focada');
  assert.equal(me.available, true);
  const weird = await request(app).put('/api/v1/vitrine/vibe').set(mari.auth).send({ vibe: 'hackeada' }).expect(200);
  assert.equal(weird.body.vibe, '');
  // Esconder a apresentação também esconde o "disponível".
  await request(app).put('/api/v1/vitrine').set(mari.auth).send({ visible: false }).expect(200);
  const hidden = await request(app).get('/api/v1/community/members').set(mari.auth).expect(200);
  assert.equal(hidden.body.items.find(item => item.id === mari.user.id).available, false);
});

test('Eventos: criar, confirmar presença, desfazer e só quem criou apaga', async () => {
  const carol = await account('Carol Evento');
  const victor = await account('Victor Evento');
  await request(app).post('/api/v1/comunidade/eventos').set(carol.auth).send({ title: '', date: inDays(2) }).expect(400);
  await request(app).post('/api/v1/comunidade/eventos').set(carol.auth).send({ title: 'Revisão', date: inDays(-2) }).expect(400);
  await request(app).post('/api/v1/comunidade/eventos').set(carol.auth).send({ title: 'Revisão', date: inDays(2), link: 'javascript:alert(1)' }).expect(400);
  const created = await request(app).post('/api/v1/comunidade/eventos').set(carol.auth)
    .send({ title: 'Revisão da P2 de Marketing', subject: 'Fundamentos do Marketing', date: inDays(2), startTime: '19:30', place: 'Google Meet', link: 'https://meet.google.com/abc-defg-hij', kind: 'revisao' })
    .expect(201);
  const event = created.body.items.find(item => item.title === 'Revisão da P2 de Marketing');
  assert.ok(event.mine);
  assert.equal(event.goingCount, 1, 'quem cria já vai');
  assert.equal(event.kind, 'revisao');

  const joined = await request(app).post(`/api/v1/comunidade/eventos/${event.id}/presenca`).set(victor.auth).send({ going: true }).expect(200);
  const seen = joined.body.items.find(item => item.id === event.id);
  assert.equal(seen.goingCount, 2);
  assert.equal(seen.imGoing, true);
  assert.equal(seen.mine, false);
  const left = await request(app).post(`/api/v1/comunidade/eventos/${event.id}/presenca`).set(victor.auth).send({ going: false }).expect(200);
  assert.equal(left.body.items.find(item => item.id === event.id).goingCount, 1);

  await request(app).delete(`/api/v1/comunidade/eventos/${event.id}`).set(victor.auth).expect(403);
  const removed = await request(app).delete(`/api/v1/comunidade/eventos/${event.id}`).set(carol.auth).expect(200);
  assert.ok(!removed.body.items.some(item => item.id === event.id));
});

test('Eventos: o que já passou há mais de 6 horas some da lista', () => {
  const now = new Date('2026-11-20T15:00:00Z'); // 12:00 em São Paulo
  assert.equal(stillShown({ date: '2026-11-20', startTime: '07:00' }, now), true);
  assert.equal(stillShown({ date: '2026-11-20', startTime: '05:30' }, now), false);
  assert.equal(stillShown({ date: '2026-11-19', startTime: '' }, now), false);
  assert.equal(stillShown({ date: '2026-11-21', startTime: '' }, now), true);
});
