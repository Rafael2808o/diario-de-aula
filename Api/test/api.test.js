import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';

test('expõe informações públicas e documentação', async () => {
  const health = await request(app).get('/health/ready');
  const docs = await request(app).get('/docs/');
  const openapi = await request(app).get('/api/v1/openapi.json');
  assert.equal(health.status, 200);
  assert.equal(docs.status, 200);
  assert.equal(openapi.status, 200);
  assert.equal(openapi.body.openapi, '3.0.3');
  assert.ok(openapi.body.components.schemas.Material);
});

test('protege dados pessoais sem autenticação', async () => {
  const plans = await request(app).get('/api/v1/study-plans');
  const materials = await request(app).get('/api/v1/materials');
  assert.equal(plans.status, 401);
  assert.equal(materials.status, 401);
});

test('completa o fluxo de conta, perfil, planejamento e diário', async () => {
  const email = `teste-${Date.now()}@estuda.local`;
  const register = await request(app).post('/api/v1/auth/register').send({
    name: 'Pessoa Teste',
    email,
    password: 'senha-segura-123',
    course: 'Design',
    institution: 'Universidade Teste',
    semester: '2º semestre'
  });
  assert.equal(register.status, 201);
  assert.ok(register.body.token);

  const auth = { Authorization: `Bearer ${register.body.token}` };
  const me = await request(app).get('/api/v1/me').set(auth);
  assert.equal(me.status, 200);
  assert.equal(me.body.email, email);

  const profile = await request(app).patch('/api/v1/me').set(auth).send({
    name: 'Pessoa Atualizada',
    course: 'Design Digital',
    institution: 'Universidade Teste',
    semester: '3º semestre'
  });
  assert.equal(profile.status, 200);
  assert.equal(profile.body.course, 'Design Digital');

  const plan = await request(app).post('/api/v1/study-plans').set(auth).send({
    subject: 'Tipografia',
    topic: 'Grid editorial',
    date: '2026-09-10',
    priority: 'Alta'
  });
  assert.equal(plan.status, 201);

  const plans = await request(app).get('/api/v1/study-plans').set(auth);
  assert.equal(plans.status, 200);
  assert.equal(plans.body[0].topic, 'Grid editorial');

  const diary = await request(app).put('/api/v1/diaries').set(auth).send({
    subject: 'Tipografia',
    date: '2026-09-08',
    actual: 'Grid e hierarquia visual',
    understood: 'Entendi a relação entre ritmo e espaçamento.',
    doubts: 'Como adaptar o grid a telas pequenas?'
  });
  assert.equal(diary.status, 200);

  const diaries = await request(app).get('/api/v1/diaries').set(auth);
  assert.equal(diaries.status, 200);
  assert.equal(diaries.body[0].subject, 'Tipografia');

  const material = await request(app).post('/api/v1/materials').set(auth).send({
    title: 'Referência sobre grid',
    type: 'Link',
    subject: 'Tipografia',
    url: 'https://example.com/grid'
  });
  assert.equal(material.status, 201);

  const library = await request(app).get('/api/v1/materials').set(auth);
  assert.equal(library.status, 200);
  assert.equal(library.body[0].title, 'Referência sobre grid');

  const removedMaterial = await request(app).delete(`/api/v1/materials/${material.body.id}`).set(auth);
  assert.equal(removedMaterial.status, 204);

  const removed = await request(app).delete(`/api/v1/study-plans/${plan.body.id}`).set(auth);
  assert.equal(removed.status, 204);

  const login = await request(app).post('/api/v1/auth/login').send({ email, password: 'senha-segura-123' });
  assert.equal(login.status, 200);
  assert.ok(login.body.token);
});
