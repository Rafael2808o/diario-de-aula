import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import request from 'supertest';
import app from '../app.js';
import { lunarHooks, parseSpotify, rankWeek, weekStart } from '../lunar.js';
import { computeProgress } from '../progress.js';
import { sanitizeHtml } from '../richtext.js';

const account = async (name, extra = {}) => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123', ...extra });
  return { token: response.body.token, user: response.body.user, auth: { Authorization: `Bearer ${response.body.token}` } };
};
const subject = (auth, name, modality = '') => request(app).post('/api/v1/subjects').set(auth).send({ name, color: '#6f8cf6', modality });

test('o limpador de anotações é o mesmo na API e no site e tira tudo que não é texto', () => {
  const api = fs.readFileSync(new URL('../richtext.js', import.meta.url), 'utf8');
  const web = fs.readFileSync(new URL('../../Web/src/lib/richtext.js', import.meta.url), 'utf8');
  assert.equal(api, web);
  assert.equal(sanitizeHtml('<h2 style="x">Título</h2><p onclick="alert(1)">a <b>b</b></p><script>alert(1)</script><img src=x onerror=alert(1)>'), '<h2>Título</h2><p>a <b>b</b></p>');
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">link</a> 3 < 4'), 'link 3 &lt; 4');
});

test('disciplina guarda modalidade e aula guarda caderno e "sem material"', async () => {
  const { auth } = await account('Caderno Teste');
  const created = await subject(auth, 'Estatística', 'EAD');
  assert.equal(created.status, 201);
  assert.equal(created.body.modality, 'EAD');
  assert.equal((await subject(auth, 'Outra', 'Talvez')).status, 400);
  const old = await subject(auth, 'Sem modalidade');
  assert.equal(old.body.modality, '');
  const lesson = await request(app).post('/api/v1/lessons').set(auth).send({ subjectId: created.body.id, date: '2026-10-20', status: 'presente', noMaterial: true });
  assert.equal(lesson.body.noMaterial, true);
  const long = `<p>${'Texto da aula. '.repeat(3000)}</p>`;
  const saved = await request(app).patch(`/api/v1/lessons/${lesson.body.id}`).set(auth).send({ annotations: `${long}<script>x</script>` });
  assert.equal(saved.status, 200);
  assert.ok(saved.body.annotations.startsWith('<p>Texto da aula.'));
  assert.ok(!saved.body.annotations.includes('script'));
  const again = await request(app).get(`/api/v1/lessons/${lesson.body.id}`).set(auth);
  assert.equal(again.body.annotations, saved.body.annotations);
  assert.equal(again.body.noMaterial, true);
});

test('histórico de XP soma exatamente o total e novas relíquias seguem a regra', () => {
  const data = {
    lessons: [
      { id: 'a', status: 'presente', taught: 'x', date: '2026-10-01' },
      { id: 'b', status: 'presente', annotations: '<p>anotação</p>', date: '2026-10-02' },
      { id: 'c', status: 'presente', annotations: '<p> </p>', date: '2026-10-03' },
      { id: 'd', status: 'falta', missedContent: 'perdi', date: '2026-10-04' }
    ],
    studySessions: [{ id: 's', durationSeconds: 90, date: '2026-10-01' }, { id: 't', durationSeconds: 90, date: '2026-10-02' }],
    flashcards: [{ id: 'f', reviews: 3, front: 'Pergunta', reviewedOn: '2026-10-02' }],
    quizResults: [{ id: 'q', total: 5, correct: 4, takenOn: '2026-10-02' }],
    exams: [{ id: 'e', title: 'P1', topics: [{ id: 't1', title: 'A', status: 'Revisado' }, { id: 't2', title: 'B', status: 'Dominado' }] }],
    tasks: [{ id: 'k', done: true, title: 'Lista' }],
    moods: [{ date: '2026-10-03', mood: 'focado' }]
  };
  const progress = computeProgress(data, '2026-10-04');
  assert.equal(progress.history.reduce((sum, entry) => sum + entry.xp, 0), progress.xp);
  const relic = id => progress.achievements.find(item => item.id === id);
  assert.equal(relic('diario-aberto').unlocked, true);
  assert.equal(relic('diario-aberto').unlockedOn, '2026-10-02');
  assert.equal(relic('lunar').unlocked, true);
  assert.equal(relic('musical').unlocked, false);
  assert.equal(relic('primeira-estrela').unlocked, true);
  assert.equal(computeProgress({}, '2026-10-04').achievements.filter(item => item.unlocked).length, 0);
});

test('mood: um por dia, troca sem duplicar e só no dia de hoje', async () => {
  const { auth } = await account('Lua Teste');
  assert.equal((await request(app).put('/api/v1/lunar/moods/today').set(auth).send({ mood: 'triste' })).status, 400);
  const first = await request(app).put('/api/v1/lunar/moods/today').set(auth).send({ mood: 'focado' });
  assert.equal(first.status, 201);
  const second = await request(app).put('/api/v1/lunar/moods/today').set(auth).send({ mood: 'iluminado' });
  assert.equal(second.status, 200);
  const list = await request(app).get('/api/v1/lunar/moods').set(auth);
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].mood, 'iluminado');
  assert.equal(list.body.items[0].date, list.body.today);
});

test('constelação conta dias distintos, desempata pela primeira data e só mostra quem participa', async () => {
  assert.equal(weekStart('2026-10-29'), '2026-10-26');
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  const people = [{ id: 'a', name: 'Ana' }, { id: 'b', name: 'Bia' }, { id: 'c', name: 'Caio' }];
  const rows = [
    { userId: 'a', date: '2026-10-27', mood: 'focado' }, { userId: 'a', date: '2026-10-28', mood: 'focado' },
    { userId: 'b', date: '2026-10-26', mood: 'focado' }, { userId: 'b', date: '2026-10-29', mood: 'focado' },
    { userId: 'c', date: '2026-10-26', mood: 'ansioso' }
  ];
  const ranked = rankWeek(people, rows, 'focado');
  assert.deepEqual(ranked.map(item => [item.id, item.days, item.position]), [['b', 2, 1], ['a', 2, 2]]);
  const visible = await account('Visível Lua');
  const hidden = await account('Escondido Lua');
  await request(app).patch('/api/v1/me').set(visible.auth).send({ preferences: { lunarPublic: true, nickname: 'Estrelinha' } });
  await request(app).put('/api/v1/lunar/moods/today').set(visible.auth).send({ mood: 'era' });
  await request(app).put('/api/v1/lunar/moods/today').set(hidden.auth).send({ mood: 'era' });
  const board = await request(app).get('/api/v1/lunar/constellation').set(hidden.auth);
  assert.equal(board.body.optedIn, false);
  const names = board.body.byMood.era.map(item => item.name);
  assert.ok(names.includes('Estrelinha'));
  assert.ok(!names.some(name => name.startsWith('Escondido')));
  assert.ok(!JSON.stringify(board.body).includes('@grimiau.local'));
});

test('rádio: só links do Spotify, sem duplicar, e só o autor edita ou exclui', async () => {
  assert.deepEqual(parseSpotify('https://open.spotify.com/intl-pt/track/4uLU6hMCjMI75M1A2tKUQC?si=1'), { type: 'track', id: '4uLU6hMCjMI75M1A2tKUQC' });
  assert.equal(parseSpotify('https://evil.example/track/4uLU6hMCjMI75M1A2tKUQC'), null);
  const original = lunarHooks.metadata;
  let calls = 0;
  lunarHooks.metadata = async () => {
    calls += 1;
    return { title: 'Música de teste', artist: 'Artista', image: '' };
  };
  try {
    const author = await account('Autora Radio');
    const other = await account('Outro Radio');
    assert.equal((await request(app).post('/api/v1/lunar/songs').set(author.auth).send({ url: 'https://spotify.link/abc', category: 'Foco' })).status, 400);
    assert.equal(calls, 0);
    const body = { url: 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', category: 'Foco', comment: 'Para focar' };
    const created = await request(app).post('/api/v1/lunar/songs').set(author.auth).send(body);
    assert.equal(created.status, 201);
    assert.equal(created.body.title, 'Música de teste');
    assert.equal((await request(app).post('/api/v1/lunar/songs').set(author.auth).send(body)).status, 409);
    const seen = await request(app).get('/api/v1/lunar/songs?categoria=Foco').set(other.auth);
    const song = seen.body.find(item => item.id === created.body.id);
    assert.equal(song.mine, false);
    assert.equal((await request(app).delete(`/api/v1/lunar/songs/${song.id}`).set(other.auth)).status, 403);
    assert.equal((await request(app).patch(`/api/v1/lunar/songs/${song.id}`).set(author.auth).send({ category: 'Relaxar', comment: '' })).status, 200);
    assert.equal((await request(app).delete(`/api/v1/lunar/songs/${song.id}`).set(author.auth)).status, 204);
  } finally {
    lunarHooks.metadata = original;
  }
});

test('avisos: ponto de partida sem enxurrada, relíquia nova avisa uma vez, comentário avisa o autor', async () => {
  const { auth } = await account('Avisos Teste');
  const subjectId = (await subject(auth, 'Matéria')).body.id;
  await request(app).post('/api/v1/lessons').set(auth).send({ subjectId, date: '2026-10-01', status: 'presente', taught: 'Conteúdo' });
  const first = await request(app).get('/api/v1/notifications').set(auth);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 0);
  await request(app).put('/api/v1/lunar/moods/today').set(auth).send({ mood: 'focado' });
  const second = await request(app).get('/api/v1/notifications').set(auth);
  const third = await request(app).get('/api/v1/notifications').set(auth);
  assert.equal(second.body.items.filter(item => item.title.includes('Relíquia Lunar')).length, 1);
  assert.equal(third.body.items.length, second.body.items.length);
  assert.equal(third.body.unread, third.body.items.length);
  await request(app).post('/api/v1/notifications/read').set(auth).send({});
  assert.equal((await request(app).get('/api/v1/notifications').set(auth)).body.unread, 0);
  await request(app).post('/api/v1/notifications/archive').set(auth).send({});
  assert.equal((await request(app).get('/api/v1/notifications').set(auth)).body.items.length, 0);

  const poster = await account('Autor Post');
  const reader = await account('Leitor Post');
  const post = await request(app).post('/api/v1/community/posts').set(poster.auth).send({ category: 'Dúvida', title: 'Como estudar?', body: '' });
  await request(app).get('/api/v1/notifications').set(poster.auth);
  await request(app).post(`/api/v1/community/posts/${post.body.id}/comments`).set(poster.auth).send({ body: 'Eu mesmo' });
  await request(app).post(`/api/v1/community/posts/${post.body.id}/comments`).set(reader.auth).send({ body: 'Com calma' });
  const inbox = await request(app).get('/api/v1/notifications').set(poster.auth);
  const comments = inbox.body.items.filter(item => item.kind === 'comunidade');
  assert.equal(comments.length, 1);
  assert.deepEqual(comments[0].link, { page: 'comunidade', params: { id: post.body.id } });
});

test('atividade compartilhada: código de convite, status individual e acesso só de participantes', async () => {
  const owner = await account('Dona Atividade');
  const mate = await account('Colega Atividade');
  const stranger = await account('Estranho Atividade');
  const created = await request(app).post('/api/v1/shared').set(owner.auth).send({ title: 'Trabalho em grupo', dueDate: '2026-11-10', subjectName: 'Marketing' });
  assert.equal(created.status, 201);
  const code = created.body.inviteCode;
  assert.match(code, /^[A-Z2-9]{8}$/);
  assert.equal((await request(app).get('/api/v1/shared').set(stranger.auth)).body.length, 0);
  assert.equal((await request(app).put(`/api/v1/shared/${created.body.id}/status`).set(stranger.auth).send({ status: 'Concluída' })).status, 404);
  assert.equal((await request(app).post('/api/v1/shared/join').set(stranger.auth).send({ code: 'ERRADO12' })).status, 404);
  const joined = await request(app).post('/api/v1/shared/join').set(mate.auth).send({ code: code.toLowerCase() });
  assert.equal(joined.status, 201);
  assert.equal(joined.body.inviteCode, undefined);
  const done = await request(app).put(`/api/v1/shared/${created.body.id}/status`).set(mate.auth).send({ status: 'Concluída' });
  const statuses = Object.fromEntries(done.body.members.map(member => [member.me ? 'eu' : member.owner ? 'dona' : 'outro', member.status]));
  assert.deepEqual(statuses, { eu: 'Concluída', dona: 'Pendente' });
  assert.equal((await request(app).patch(`/api/v1/shared/${created.body.id}`).set(mate.auth).send({ title: 'Mudei' })).status, 403);
  await request(app).get('/api/v1/notifications').set(owner.auth);
  const ownerInbox = (await request(app).get('/api/v1/notifications').set(owner.auth)).body.items;
  assert.ok(ownerInbox.some(item => item.title.includes('entrou')));
  assert.ok(ownerInbox.some(item => item.title.includes('concluiu')));
  const edited = await request(app).patch(`/api/v1/shared/${created.body.id}`).set(owner.auth).send({ dueDate: '2026-11-12' });
  assert.equal(edited.body.dueDate, '2026-11-12');
  const mateInbox = (await request(app).get('/api/v1/notifications').set(mate.auth)).body.items;
  assert.ok(mateInbox.some(item => item.body.includes('12/11/2026')));
  assert.equal((await request(app).delete(`/api/v1/shared/${created.body.id}/members/${mate.user.id}`).set(owner.auth)).status, 204);
  assert.equal((await request(app).get('/api/v1/shared').set(mate.auth)).body.length, 0);
  assert.equal((await request(app).post('/api/v1/shared/join').set(mate.auth).send({ code })).status, 403);
  const closed = await request(app).post(`/api/v1/shared/${created.body.id}/close`).set(owner.auth).send({});
  assert.equal(closed.body.closed, true);
});

test('arquivo excluído vai para a lixeira, some dos links e pode voltar', async () => {
  const { auth } = await account('Lixeira Teste');
  const material = await request(app).post('/api/v1/materials').set(auth).send({ title: 'Slides', type: 'PDF' });
  const file = await request(app).post('/api/v1/files').set(auth).send({ materialId: material.body.id, name: 'aula.pdf', mime: 'application/pdf', data: Buffer.from('%PDF-1.4 teste').toString('base64') });
  assert.equal((await request(app).delete(`/api/v1/files/${file.body.id}`).set(auth)).status, 204);
  assert.equal((await request(app).get('/api/v1/files').set(auth)).body.length, 0);
  assert.equal((await request(app).get(`/api/v1/files/${file.body.id}`).set(auth)).status, 404);
  assert.equal((await request(app).post(`/api/v1/files/${file.body.id}/ticket`).set(auth)).status, 404);
  const trash = await request(app).get('/api/v1/files/trash').set(auth);
  assert.equal(trash.body.length, 1);
  assert.ok(trash.body[0].deletedAt);
  assert.equal((await request(app).get('/api/v1/materials').set(auth)).body.length, 1);
  assert.equal((await request(app).post(`/api/v1/files/${file.body.id}/restore`).set(auth)).status, 200);
  assert.equal((await request(app).get('/api/v1/files').set(auth)).body.length, 1);
});

test('sugestões de disciplinas: só nomes usados por duas ou mais contas do mesmo curso', async () => {
  const profile = { course: 'Publicidade e Propaganda', institution: 'Faculdade Sugestão' };
  const a = await account('Sug A', profile);
  const b = await account('Sug B', profile);
  const outside = await account('Sug C', { course: 'Direito', institution: 'Faculdade Sugestão' });
  await subject(a.auth, 'Fundamentos do Marketing');
  await subject(b.auth, 'fundamentos do marketing');
  await subject(a.auth, 'Só da Ana');
  await subject(outside.auth, 'Fundamentos do Marketing');
  const me = await account('Sug Nova', { course: 'publicidade e propaganda', institution: 'faculdade sugestao' });
  const list = await request(app).get('/api/v1/subjects/suggestions').set(me.auth);
  assert.deepEqual(list.body.items.map(item => item.name), ['Fundamentos do Marketing']);
  const noProfile = await account('Sem Curso');
  assert.equal((await request(app).get('/api/v1/subjects/suggestions').set(noProfile.auth)).body.needsProfile, true);
});
