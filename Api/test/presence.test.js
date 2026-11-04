import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
import { isOnline, onlineWindowMs } from '../presence.js';

const account = async name => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123' });
  return { user: response.body.user, auth: { Authorization: `Bearer ${response.body.token}` } };
};

test('membros: online com sinal recente, visto por último ao sair e nada técnico exposto', async () => {
  const ana = await account('Ana Presença Souza');
  const bia = await account('Bia Presença Lima');
  await request(app).patch('/api/v1/me').set(ana.auth).send({ preferences: { nickname: 'Aninha da Lua' } }).expect(200);
  await request(app).post('/api/v1/presence/heartbeat').set(ana.auth).expect(204);
  await request(app).post('/api/v1/presence/heartbeat').set(bia.auth).expect(204);

  let list = (await request(app).get('/api/v1/community/members').set(bia.auth).expect(200)).body;
  const anaRow = list.items.find(item => item.id === ana.user.id);
  assert.equal(anaRow.online, true);
  // O apelido das Fases da Lua não aparece aqui: só o nome público, como no resto do Conselho.
  assert.equal(anaRow.name, 'Ana S.');
  assert.deepEqual(Object.keys(anaRow).sort(), ['avatarVersion', 'id', 'lastSeenAt', 'me', 'name', 'online']);
  assert.equal(list.items.find(item => item.id === bia.user.id).me, true);

  await request(app).post('/api/v1/presence/leave').set(ana.auth).expect(204);
  list = (await request(app).get('/api/v1/community/members').set(bia.auth).expect(200)).body;
  assert.equal(list.items.find(item => item.id === ana.user.id).online, false);
  assert.ok(list.items.find(item => item.id === ana.user.id).lastSeenAt);

  // Esconder o status tira a pessoa da lista, e a preferência fica salva sem mexer nas outras.
  const saved = await request(app).patch('/api/v1/me').set(ana.auth).send({ preferences: { presenceHidden: true } }).expect(200);
  assert.equal(saved.body.preferences.presenceHidden, true);
  assert.equal(saved.body.preferences.rankingPublic, false);
  list = (await request(app).get('/api/v1/community/members').set(bia.auth).expect(200)).body;
  assert.equal(list.items.some(item => item.id === ana.user.id), false);

  await request(app).get('/api/v1/community/members').expect(401);
});

test('presença expira sozinha depois da tolerância, sem oscilar antes', () => {
  const now = Date.now();
  assert.equal(isOnline({ lastSeenAt: now - 70_000, leftAt: null }, now), true);
  assert.equal(isOnline({ lastSeenAt: now - onlineWindowMs - 1, leftAt: null }, now), false);
  assert.equal(isOnline({ lastSeenAt: now - 10_000, leftAt: now - 5_000 }, now), false);
  assert.equal(isOnline({ lastSeenAt: now - 5_000, leftAt: now - 10_000 }, now), true);
});
