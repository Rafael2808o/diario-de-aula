import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { memory } from '../store.js';
import { purgeExpired } from '../community.js';

const account = async name => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123' });
  return { user: response.body.user, email, auth: { Authorization: `Bearer ${response.body.token}` } };
};
const pdf = text => Buffer.from(`%PDF-1.4\n${text}\n%%EOF`).toString('base64');
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7), Buffer.from([0xff, 0xd9])]).toString('base64');
const xpOf = async who => (await request(app).get('/api/v1/progress').set(who.auth)).body.xp;

test('papéis e comunicados: só quem tem papel publica; importante avisa todo mundo', async () => {
  const admin = await account('Ada Admin Souza');
  const pub = await account('Paulo Publica Lima');
  const aluno = await account('Alice Aluna Reis');
  process.env.ADMIN_EMAILS = admin.email;

  const notice = { title: 'Prova de Cálculo adiada', body: 'A P1 foi para a semana que vem.', category: 'Provas', eventDate: '2026-11-20', important: true };
  await request(app).post('/api/v1/comunicados').set(aluno.auth).send(notice).expect(403);
  await request(app).put(`/api/v1/roles/${pub.user.id}`).set(aluno.auth).send({ role: 'publicador' }).expect(403);
  await request(app).put(`/api/v1/roles/${pub.user.id}`).set(admin.auth).send({ role: 'publicador' }).expect(200);
  assert.equal((await request(app).get('/api/v1/me/role').set(pub.auth)).body.role, 'publicador');

  const created = await request(app).post('/api/v1/comunicados').set(pub.auth).send({ ...notice, file: { name: 'aviso.pdf', mime: 'application/pdf', data: pdf('aviso') } }).expect(201);
  assert.equal(created.body.important, true);
  assert.equal(created.body.file.name, 'aviso.pdf');
  const alerts = (await request(app).get('/api/v1/notifications').set(aluno.auth)).body.items;
  assert.ok(alerts.some(item => item.kind === 'comunicado' && item.title.includes('Prova de Cálculo')));

  await request(app).post(`/api/v1/comunicados/${created.body.id}/lido`).set(aluno.auth).expect(204);
  assert.equal((await request(app).get('/api/v1/comunicados').set(aluno.auth)).body.find(item => item.id === created.body.id).read, true);
  await request(app).patch(`/api/v1/comunicados/${created.body.id}`).set(aluno.auth).send({ archived: true }).expect(403);
  await request(app).patch(`/api/v1/comunicados/${created.body.id}`).set(admin.auth).send({ archived: true }).expect(200);
  assert.equal((await request(app).get('/api/v1/comunicados').set(aluno.auth)).body.some(item => item.id === created.body.id), false);
  delete process.env.ADMIN_EMAILS;
});

test('Conselho: só categorias novas, status pela moderação e o autor acompanha', async () => {
  const mod = await account('Mila Modera Costa');
  const autor = await account('Caio Sugere Melo');
  process.env.ADMIN_EMAILS = mod.email;
  await request(app).post('/api/v1/community/posts').set(autor.auth).send({ category: 'Dúvida', title: 'Conversa geral', body: '' }).expect(400);
  const post = await request(app).post('/api/v1/community/posts').set(autor.auth).send({ category: 'Erro encontrado', title: 'Botão some no celular', body: 'No Ritual.', attachment: { mime: 'image/jpeg', data: jpeg } }).expect(201);
  assert.equal(post.body.status, 'Recebido');
  assert.equal(post.body.hasAttachment, true);
  await request(app).get(`/api/v1/community/posts/${post.body.id}/anexo`).expect(200);
  await request(app).put(`/api/v1/community/posts/${post.body.id}/status`).set(autor.auth).send({ status: 'Resolvido' }).expect(403);
  const updated = await request(app).put(`/api/v1/community/posts/${post.body.id}/status`).set(mod.auth).send({ status: 'Em desenvolvimento', reply: 'Já estamos corrigindo.' }).expect(200);
  assert.equal(updated.body.reply, 'Já estamos corrigindo.');
  const mine = (await request(app).get('/api/v1/community/posts?minhas=1').set(autor.auth)).body;
  assert.ok(mine.every(item => item.mine) && mine.some(item => item.status === 'Em desenvolvimento'));
  assert.ok((await request(app).get('/api/v1/notifications').set(autor.auth)).body.items.some(item => item.title.includes('Em desenvolvimento')));
  delete process.env.ADMIN_EMAILS;
});

test('Bate-papo: cartinha, reação, resposta avisam o autor e tudo some depois de 48 h', async () => {
  const ana = await account('Ana Carta Dias');
  const bia = await account('Bia Carta Luz');
  const letter = await request(app).post('/api/v1/batepapo').set(ana.auth).send({ title: 'Oi, migles', body: 'Alguém para estudar hoje?' }).expect(201);
  assert.ok(Date.parse(letter.body.expiresAt) - Date.parse(letter.body.createdAt) >= 47.9 * 3600_000);
  await request(app).post(`/api/v1/batepapo/${letter.body.id}/reactions`).set(bia.auth).send({ emoji: '💜' }).expect(200);
  const commented = await request(app).post(`/api/v1/batepapo/${letter.body.id}/comments`).set(bia.auth).send({ body: 'Eu!' }).expect(201);
  assert.equal(commented.body.comments.length, 1);
  assert.equal(commented.body.reactions.find(item => item.emoji === '💜').count, 1);
  const alerts = (await request(app).get('/api/v1/notifications').set(ana.auth)).body.items;
  assert.ok(alerts.some(item => item.title.includes('reagiu')) && alerts.some(item => item.title.includes('respondeu')));
  await request(app).delete(`/api/v1/batepapo/${letter.body.id}`).set(bia.auth).expect(404);

  // Vence a cartinha e roda a limpeza: some a carta, a resposta e a reação.
  memory.letters.find(item => item.id === letter.body.id).expiresAt = Date.now() - 1;
  const purged = await purgeExpired({ force: true });
  assert.ok(purged.letters >= 1);
  assert.equal(memory.letterComments.some(item => item.letterId === letter.body.id), false);
  assert.equal(memory.letterReactions.some(item => item.letterId === letter.body.id), false);
  assert.equal((await request(app).get('/api/v1/batepapo').set(ana.auth)).body.some(item => item.id === letter.body.id), false);
});

test('Resumos: XP sem repetição ao compartilhar, reagir e salvar', async () => {
  const autora = await account('Luna Resumo Prado');
  const leitor = await account('Leo Leitor Matos');
  const base = await xpOf(autora);
  const file = { name: 'resumo.pdf', mime: 'application/pdf', data: pdf('membrana plasmática') };
  const shared = await request(app).post('/api/v1/resumos').set(autora.auth).send({ title: 'Membrana plasmática', subject: 'Biologia Celular', file }).expect(201);
  assert.equal(shared.body.xpAwarded, 50);
  const again = await request(app).post('/api/v1/resumos').set(autora.auth).send({ title: 'Membrana de novo', subject: 'Biologia Celular', file }).expect(201);
  assert.equal(again.body.xpAwarded, 0, 'o mesmo arquivo não rende XP duas vezes');
  assert.equal(await xpOf(autora), base + 50);

  const own = await request(app).post(`/api/v1/resumos/${shared.body.id}/reactions`).set(autora.auth).send({ kind: 'ajudou' }).expect(200);
  assert.equal(own.body.xpAwarded, 0, 'reagir ao próprio resumo não dá XP');
  const first = await request(app).post(`/api/v1/resumos/${shared.body.id}/reactions`).set(leitor.auth).send({ kind: 'consegui' }).expect(200);
  assert.equal(first.body.xpAwarded, 20);
  await request(app).post(`/api/v1/resumos/${shared.body.id}/reactions`).set(leitor.auth).send({ kind: 'consegui' }).expect(200);
  const back = await request(app).post(`/api/v1/resumos/${shared.body.id}/reactions`).set(leitor.auth).send({ kind: 'consegui' }).expect(200);
  assert.equal(back.body.xpAwarded, 0, 'tirar e pôr a reação não dá XP de novo');
  const other = await request(app).post(`/api/v1/resumos/${shared.body.id}/reactions`).set(leitor.auth).send({ kind: 'dificil' }).expect(200);
  assert.equal(other.body.xpAwarded, 0, 'XP de reação é uma vez por resumo');

  const saved = await request(app).post(`/api/v1/resumos/${shared.body.id}/salvar`).set(leitor.auth).expect(200);
  assert.equal(saved.body.xpAwarded, 40);
  assert.equal(saved.body.author, 'Luna P.');
  assert.equal((await request(app).post(`/api/v1/resumos/${shared.body.id}/salvar`).set(leitor.auth)).body.xpAwarded, 0);
  const leitorXp = await xpOf(leitor);
  assert.equal(leitorXp, 60);
  const history = (await request(app).get('/api/v1/xp-events').set(leitor.auth)).body;
  assert.equal(history.reduce((sum, item) => sum + item.xp, 0), 60);

  await request(app).get(`/api/v1/resumos/${shared.body.id}/arquivo`).expect(200).expect('content-type', /pdf/);
  await request(app).post('/api/v1/resumos').set(autora.auth).send({ title: 'Sem arquivo', subject: 'Bio', file: { name: 'x.exe', mime: 'application/pdf', data: Buffer.from('MZ').toString('base64') } }).expect(400);
  await request(app).delete(`/api/v1/resumos/${shared.body.id}`).set(leitor.auth).expect(404);
  await request(app).delete(`/api/v1/resumos/${shared.body.id}`).set(autora.auth).expect(204);
  await request(app).get(`/api/v1/resumos/${shared.body.id}/arquivo`).expect(404);
  assert.equal(await xpOf(leitor), 60, 'apagar o resumo não tira o XP já ganho');

  const mural = (await request(app).get('/api/v1/mural').set(leitor.auth)).body;
  assert.ok(mural.items.some(item => item.text.includes('+40 XP')));
  assert.ok(mural.rules.some(([label, xp]) => label.includes('Feed') && xp === 200));
});

test('Feed: +200 XP uma vez por dia, curtida e comentário, e a foto some com tudo depois de 24 h', async () => {
  const ana = await account('Ana Foto Brito');
  const bia = await account('Bia Foto Nunes');
  const photo = await request(app).post('/api/v1/feed').set(ana.auth).send({ mime: 'image/jpeg', data: jpeg, caption: 'Mesa de estudos' }).expect(201);
  assert.equal(photo.body.xpAwarded, 200);
  await request(app).delete(`/api/v1/feed/${photo.body.id}`).set(ana.auth).expect(204);
  const again = await request(app).post('/api/v1/feed').set(ana.auth).send({ mime: 'image/jpeg', data: jpeg }).expect(201);
  assert.equal(again.body.xpAwarded, 0, 'apagar e publicar de novo no mesmo dia não dá XP');
  assert.equal((await request(app).get('/api/v1/feed/hoje').set(ana.auth)).body.xpAvailable, false);
  assert.equal(await xpOf(ana), 200);

  await request(app).post(`/api/v1/feed/${again.body.id}/reactions`).set(bia.auth).send({ emoji: '❤️' }).expect(200);
  const commented = await request(app).post(`/api/v1/feed/${again.body.id}/comments`).set(bia.auth).send({ body: 'Que linda!' }).expect(201);
  assert.equal(commented.body.reactions.find(item => item.emoji === '❤️').count, 1);
  assert.equal(commented.body.comments[0].author.name, 'Bia N.');
  assert.ok((await request(app).get('/api/v1/notifications').set(ana.auth)).body.items.some(item => item.title.includes('curtiu')));

  memory.feedPhotos.find(item => item.id === again.body.id).expiresAt = Date.now() - 1;
  await purgeExpired({ force: true });
  assert.equal(memory.feedPhotos.some(item => item.id === again.body.id), false);
  assert.equal(memory.feedComments.some(item => item.photoId === again.body.id), false);
  assert.equal(memory.feedReactions.some(item => item.photoId === again.body.id), false);
  await request(app).get(`/api/v1/feed/${again.body.id}/foto`).expect(404);
  assert.equal(await xpOf(ana), 200, 'a foto expirar não tira o XP');
});
