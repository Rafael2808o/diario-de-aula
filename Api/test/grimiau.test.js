import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { dailyHoroscope } from '../horoscope.js';

const account = async (name) => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123' });
  return { token: response.body.token, user: response.body.user, auth: { Authorization: `Bearer ${response.body.token}` } };
};

test('preferências novas são mescladas sem apagar as antigas', async () => {
  const { auth } = await account('Prefs Teste');
  await request(app).patch('/api/v1/me').set(auth).send({ preferences: { studyMinutes: 90, organization: 'Por prazo', reminders: { classes: true } } });
  const signed = await request(app).patch('/api/v1/me').set(auth).send({ preferences: { sign: 'leao', spotifyUrl: 'https://open.spotify.com/intl-pt/playlist/37i9dQZF1DX8Uebhn9wzrS?si=abc' } });
  assert.equal(signed.status, 200);
  assert.equal(signed.body.preferences.sign, 'leao');
  assert.equal(signed.body.preferences.spotifyUrl, 'https://open.spotify.com/playlist/37i9dQZF1DX8Uebhn9wzrS');
  assert.equal(signed.body.preferences.studyMinutes, 90);
  assert.equal(signed.body.preferences.organization, 'Por prazo');
  assert.equal(signed.body.preferences.reminders.classes, true);
  const seen = await request(app).patch('/api/v1/me').set(auth).send({ preferences: { announcementSeen: '2.0.0' } });
  assert.equal(seen.body.preferences.sign, 'leao');
  assert.equal(seen.body.preferences.announcementSeen, '2.0.0');
  const invalid = await request(app).patch('/api/v1/me').set(auth).send({ preferences: { sign: 'dragao', spotifyUrl: 'https://evil.example/x' } });
  assert.equal(invalid.body.preferences.sign, '');
  assert.equal(invalid.body.preferences.spotifyUrl, '');
});

test('sessões de estudo não são salvas duas vezes', async () => {
  const { auth } = await account('Ritual Teste');
  const body = { clientId: 'sessao-abc-123', date: '2026-10-28', startTime: '19:00', durationSeconds: 1500 };
  const first = await request(app).post('/api/v1/study-sessions').set(auth).send(body);
  const second = await request(app).post('/api/v1/study-sessions').set(auth).send(body);
  assert.equal(first.status, 201);
  assert.equal(second.status, 409);
  const list = await request(app).get('/api/v1/study-sessions').set(auth);
  assert.equal(list.body.length, 1);
  assert.equal(list.body[0].durationSeconds, 1500);
});

test('aula pode ser vinculada a uma prova só da mesma conta', async () => {
  const { auth } = await account('Vinculo Teste');
  const subject = await request(app).post('/api/v1/subjects').set(auth).send({ name: 'Cálculo', color: '#8d70b8' });
  const exam = await request(app).post('/api/v1/exams').set(auth).send({ subjectId: subject.body.id, title: 'P1', date: '2026-11-10' });
  const lesson = await request(app).post('/api/v1/lessons').set(auth).send({ subjectId: subject.body.id, date: '2026-10-20', status: 'presente', taught: 'Limites', examId: exam.body.id });
  assert.equal(lesson.status, 201);
  assert.equal(lesson.body.examId, exam.body.id);
  const other = await account('Outra Conta');
  const foreign = await request(app).post('/api/v1/subjects').set(other.auth).send({ name: 'Física', color: '#c7b8dc' });
  const stolen = await request(app).post('/api/v1/lessons').set(other.auth).send({ subjectId: foreign.body.id, date: '2026-10-20', examId: exam.body.id });
  assert.equal(stolen.status, 400);
  await request(app).delete(`/api/v1/exams/${exam.body.id}`).set(auth);
  const kept = await request(app).get(`/api/v1/lessons/${lesson.body.id}`).set(auth);
  assert.equal(kept.status, 200);
  assert.equal(kept.body.examId, null);
  assert.equal(kept.body.taught, 'Limites');
});

test('foto de perfil: valida o arquivo e expõe só a versão no usuário', async () => {
  const { auth, user } = await account('Foto Teste');
  const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5b0000000049454e44ae426082', 'hex');
  const fake = await request(app).put('/api/v1/me/avatar').set(auth).send({ mime: 'image/png', data: Buffer.from('not an image').toString('base64') });
  assert.equal(fake.status, 400);
  const saved = await request(app).put('/api/v1/me/avatar').set(auth).send({ mime: 'image/png', data: png.toString('base64') });
  assert.equal(saved.status, 200);
  assert.ok(saved.body.avatarVersion);
  const me = await request(app).get('/api/v1/me').set(auth);
  assert.equal(me.body.avatarVersion, saved.body.avatarVersion);
  const image = await request(app).get(`/api/v1/avatars/${user.id}`);
  assert.equal(image.status, 200);
  assert.equal(image.headers['content-type'], 'image/png');
  const removed = await request(app).delete('/api/v1/me/avatar').set(auth);
  assert.equal(removed.body.avatarVersion, '');
  assert.equal((await request(app).get(`/api/v1/avatars/${user.id}`)).status, 404);
});

test('quadro global: todos veem, só o autor altera e nada privado vaza', async () => {
  const ana = await account('Ana Beatriz Souza');
  const bia = await account('Bia Lima');
  const created = await request(app).post('/api/v1/community/posts').set(ana.auth).send({ category: 'Dúvida', title: 'Como funciona o simulado?', body: 'Alguém já usou?' });
  assert.equal(created.status, 201);
  assert.equal(created.body.author.name, 'Ana S.');
  const seen = await request(app).get('/api/v1/community/posts').set(bia.auth);
  const post = seen.body.find(item => item.id === created.body.id);
  assert.ok(post);
  assert.equal(post.mine, false);
  assert.ok(!JSON.stringify(seen.body).includes('@grimiau.local'));
  const hijack = await request(app).patch(`/api/v1/community/posts/${post.id}`).set(bia.auth).send({ category: 'Dúvida', title: 'Editado por outra', body: '' });
  assert.equal(hijack.status, 404);
  assert.equal((await request(app).delete(`/api/v1/community/posts/${post.id}`).set(bia.auth)).status, 404);
  const commented = await request(app).post(`/api/v1/community/posts/${post.id}/comments`).set(bia.auth).send({ body: 'Usei, é ótimo.' });
  assert.equal(commented.body.comments.length, 1);
  const commentId = commented.body.comments[0].id;
  assert.equal((await request(app).delete(`/api/v1/community/comments/${commentId}`).set(ana.auth)).status, 404);
  const filtered = await request(app).get('/api/v1/community/posts?category=Erro%20encontrado').set(bia.auth);
  assert.ok(!filtered.body.some(item => item.id === post.id));
  const searched = await request(app).get('/api/v1/community/posts?q=simulado').set(bia.auth);
  assert.ok(searched.body.some(item => item.id === post.id));
  assert.equal((await request(app).delete(`/api/v1/community/posts/${post.id}`).set(ana.auth)).status, 204);
  assert.equal((await request(app).get(`/api/v1/community/posts/${post.id}`).set(bia.auth)).status, 404);
  assert.equal((await request(app).get('/api/v1/community/posts')).status, 401);
});

test('horóscopo só aceita a previsão do dia pedido', async () => {
  const source = (date) => async () => ({ ok: true, json: async () => ({ data: { date, horoscope: 'A busy day.' } }) });
  const translate = async () => ({ data: { text: 'Dia movimentado.' } });
  const ok = await dailyHoroscope('leao', '2026-10-28', { fetchSource: source('2026-10-28'), translate });
  assert.equal(ok.text, 'Dia movimentado.');
  await assert.rejects(dailyHoroscope('virgem', '2026-10-28', { fetchSource: source('2026-10-27'), translate }));
});
