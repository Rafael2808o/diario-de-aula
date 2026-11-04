import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';

const account = async name => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123' });
  return { user: response.body.user, auth: { Authorization: `Bearer ${response.body.token}` } };
};

// JPEG falso de 500 KB: passa pela checagem de assinatura e testa o limite de tamanho do corpo.
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500 * 1024, 1), Buffer.from([0xff, 0xd9])]);

test('Feed dos Migles: publica, todos veem, só o autor apaga e nada privado vaza', async () => {
  const ana = await account('Ana Feed Souza');
  const bia = await account('Bia Feed Lima');

  await request(app).post('/api/v1/feed').set(ana.auth).send({ mime: 'image/png', data: jpeg.toString('base64') }).expect(400);
  await request(app).post('/api/v1/feed').set(ana.auth).send({ mime: 'image/jpeg', data: Buffer.from('não é imagem').toString('base64') }).expect(400);

  const created = await request(app).post('/api/v1/feed').set(ana.auth)
    .send({ mime: 'image/jpeg', data: jpeg.toString('base64'), caption: 'Minha mesa', inspired: true, inspiration: 'Sua mesa de estudos', width: 800, height: 600 })
    .expect(201);
  assert.equal(created.body.author.name, 'Ana S.');
  assert.equal(created.body.inspired, true);
  assert.equal(created.body.mine, true);

  const seen = (await request(app).get('/api/v1/feed').set(bia.auth).expect(200)).body.find(item => item.id === created.body.id);
  assert.ok(seen);
  assert.equal(seen.mine, false);
  assert.equal(JSON.stringify(seen).includes('@'), false);

  const image = await request(app).get(`/api/v1/feed/${created.body.id}/foto`).expect(200);
  assert.equal(image.headers['content-type'], 'image/jpeg');
  assert.equal(Buffer.compare(image.body, jpeg), 0);

  await request(app).delete(`/api/v1/feed/${created.body.id}`).set(bia.auth).expect(404);
  await request(app).delete(`/api/v1/feed/${created.body.id}`).set(ana.auth).expect(204);
  await request(app).get(`/api/v1/feed/${created.body.id}/foto`).expect(404);
  await request(app).get('/api/v1/feed').expect(401);
});
