import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import app from '../app.js';
import { computeProgress, levelFor } from '../progress.js';

const account = async (name, extra = {}) => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123', ...extra });
  return { user: response.body.user, auth: { Authorization: `Bearer ${response.body.token}` } };
};

test('a regra de progresso é a mesma na API e no site', () => {
  const api = fs.readFileSync(new URL('../progress.js', import.meta.url), 'utf8');
  const web = fs.readFileSync(new URL('../../Web/src/lib/progress.js', import.meta.url), 'utf8');
  assert.equal(api, web);
});

test('XP, nível e sequência saem só dos registros', () => {
  const progress = computeProgress(
    {
      lessons: [{ status: 'presente', draft: false, taught: 'Ethos', date: '2026-10-27' }, { status: 'presente', draft: true, taught: 'rascunho', date: '2026-10-26' }],
      studySessions: [{ date: '2026-10-28', startTime: '22:30', durationSeconds: 1500 }],
      flashcards: [{ reviews: 3, level: 'fácil', reviewedOn: '2026-10-28' }],
      quizResults: [{ total: 5, correct: 4, takenOn: '2026-10-26' }],
      exams: [{ topics: [{ status: 'Revisado' }, { status: 'Dominado' }, { status: 'Revisado' }] }],
      tasks: [{ done: true }, { done: false }]
    },
    '2026-10-28'
  );
  // 20 (aula) + 25 (min) + 6 (revisões) + 10 + 12 (simulado) + 20 (dois revisados) + 20 (dominado) + 10 (tarefa)
  assert.equal(progress.xp, 123);
  assert.equal(progress.level, 2);
  assert.equal(progress.streak, 3);
  assert.ok(progress.achievements.find(item => item.id === 'noturno').unlocked);
  assert.ok(progress.achievements.find(item => item.id === 'grimorio').unlocked);
  assert.equal(levelFor(99), 1);
  assert.equal(levelFor(100), 2);
});

test('ranking mostra só quem escolheu participar e nunca o e-mail ou o curso', async () => {
  const hidden = await account('Pessoa Oculta');
  const shown = await account('Luna Estrela Clara');
  const before = await request(app).get('/api/v1/ranking').set(shown.auth);
  assert.equal(before.status, 200);
  assert.equal(before.body.optedIn, false);
  assert.ok(!before.body.items.some(item => item.id === shown.user.id || item.id === hidden.user.id));

  const joined = await request(app).patch('/api/v1/me').set(shown.auth).send({ preferences: { rankingPublic: true } });
  assert.equal(joined.body.preferences.rankingPublic, true);
  await request(app).post('/api/v1/study-sessions').set(shown.auth).send({ clientId: 'ranking-1', date: '2026-10-28', startTime: '10:00', durationSeconds: 600 });
  const after = await request(app).get('/api/v1/ranking').set(hidden.auth);
  const entry = after.body.items.find(item => item.id === shown.user.id);
  assert.equal(entry.name, 'Luna C.');
  assert.ok(entry.xp >= 10);
  assert.ok(!after.body.items.some(item => item.id === hidden.user.id));
  const raw = JSON.stringify(after.body);
  assert.ok(!raw.includes('@grimiau.local'));
  assert.ok(!raw.includes('course') && !raw.includes('institution'));

  // Outras preferências continuam salvas quando o ranking é ligado ou desligado.
  const left = await request(app).patch('/api/v1/me').set(shown.auth).send({ preferences: { rankingPublic: false } });
  assert.equal(left.body.preferences.rankingPublic, false);
  const turma = await request(app).get('/api/v1/ranking?escopo=turma').set(hidden.auth);
  assert.equal(turma.body.needsClass, true);
});
