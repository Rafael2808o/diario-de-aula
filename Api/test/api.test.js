import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../app.js';
test('expõe disciplinas', async () => { const response = await request(app).get('/api/v1/subjects'); assert.equal(response.status, 200); assert.equal(response.body.length, 6); });
test('cria plano de estudo', async () => { const response = await request(app).post('/api/v1/study-plans').send({ subject: 'Tipografia', topic: 'Grid' }); assert.equal(response.status, 201); });
