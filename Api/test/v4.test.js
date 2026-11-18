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
