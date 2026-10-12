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

test('mantém contas novas vazias e exige escolhas explícitas', async () => {
  const register = await request(app).post('/api/v1/auth/register').send({
    name: 'Conta Vazia',
    email: `vazia-${Date.now()}@estuda.local`,
    password: 'senha-segura-123'
  });
  const auth = { Authorization: `Bearer ${register.body.token}` };

  const [plans, diaries, materials] = await Promise.all([
    request(app).get('/api/v1/study-plans').set(auth),
    request(app).get('/api/v1/diaries').set(auth),
    request(app).get('/api/v1/materials').set(auth)
  ]);
  assert.deepEqual(plans.body, []);
  assert.deepEqual(diaries.body, []);
  assert.deepEqual(materials.body, []);

  const planWithoutPriority = await request(app)
    .post('/api/v1/study-plans')
    .set(auth)
    .send({ subject: 'Disciplina escolhida', topic: 'Conteúdo escolhido' });
  const materialWithoutType = await request(app)
    .post('/api/v1/materials')
    .set(auth)
    .send({ title: 'Material escolhido' });
  assert.equal(planWithoutPriority.status, 400);
  assert.equal(materialWithoutType.status, 400);
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

async function newAccount(label) {
  const email = `${label}-${Date.now()}-${Math.random().toString(16).slice(2)}@estuda.local`;
  const register = await request(app).post('/api/v1/auth/register').send({ name: 'Pessoa Teste', email, password: 'senha-segura-123' });
  return { email, token: register.body.token, auth: { Authorization: `Bearer ${register.body.token}` } };
}

test('salva perfil acadêmico e rotina com validação', async () => {
  const { auth } = await newAccount('perfil');
  const saved = await request(app).patch('/api/v1/me').set(auth).send({
    institution: 'Faculdade Teste',
    shift: 'Noite',
    termStart: '2026-08',
    termEnd: '2026-12',
    preferences: {
      studyMinutes: 90,
      studySlots: [{ day: 'Seg', start: '07:00', end: '08:00' }, { day: 'Xyz', start: '09:00', end: '10:00' }],
      reminders: { exams: true },
      organization: 'Por prazo'
    }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.shift, 'Noite');
  assert.equal(saved.body.termEnd, '2026-12');
  assert.equal(saved.body.preferences.studyMinutes, 90);
  assert.deepEqual(saved.body.preferences.studySlots, [{ day: 'Seg', start: '07:00', end: '08:00' }]);
  assert.deepEqual(saved.body.preferences.reminders, { classes: false, exams: true, study: false });

  const invertedTerm = await request(app).patch('/api/v1/me').set(auth).send({ termStart: '2026-12', termEnd: '2026-08' });
  const badShift = await request(app).patch('/api/v1/me').set(auth).send({ shift: 'Madrugada' });
  assert.equal(invertedTerm.status, 400);
  assert.equal(badShift.status, 400);
});

test('gerencia disciplinas com horários, ordem e isolamento por conta', async () => {
  const owner = await newAccount('disciplinas');
  const other = await newAccount('outra');
  const first = await request(app).post('/api/v1/subjects').set(owner.auth).send({
    name: 'Tipografia',
    professor: 'Profa. Ana',
    color: '#7c8cf8',
    schedule: [
      { day: 'Seg', start: '19:00', end: '20:40', room: 'Sala 12' },
      { day: 'Qua', start: '19:00', end: '20:40' },
      { day: 'Sex', start: '21:00', end: '20:00' }
    ],
    startDate: '2026-08-03',
    endDate: '2026-12-11'
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.schedule.length, 2);
  assert.equal(first.body.schedule[0].room, 'Sala 12');

  const second = await request(app).post('/api/v1/subjects').set(owner.auth).send({ name: 'Cor', color: '#c08cf0' });
  const noColor = await request(app).post('/api/v1/subjects').set(owner.auth).send({ name: 'Sem cor' });
  assert.equal(second.status, 201);
  assert.equal(noColor.status, 400);

  const reordered = await request(app).put('/api/v1/subjects/order').set(owner.auth).send({ ids: [second.body.id, first.body.id] });
  assert.deepEqual(reordered.body.map(subject => subject.name), ['Cor', 'Tipografia']);

  const edited = await request(app).put(`/api/v1/subjects/${first.body.id}`).set(owner.auth).send({ ...first.body, professor: 'Prof. Bruno' });
  assert.equal(edited.body.professor, 'Prof. Bruno');

  const foreignEdit = await request(app).put(`/api/v1/subjects/${first.body.id}`).set(other.auth).send({ name: 'Invasão', color: '#000000' });
  const foreignList = await request(app).get('/api/v1/subjects').set(other.auth);
  assert.equal(foreignEdit.status, 404);
  assert.deepEqual(foreignList.body, []);

  const removed = await request(app).delete(`/api/v1/subjects/${second.body.id}`).set(owner.auth);
  const remaining = await request(app).get('/api/v1/subjects').set(owner.auth);
  assert.equal(removed.status, 204);
  assert.deepEqual(remaining.body.map(subject => subject.name), ['Tipografia']);
});

test('encerra sessão e redefine senha com token de uso único', async () => {
  const account = await newAccount('senha');
  const logout = await request(app).post('/api/v1/auth/logout').set(account.auth);
  const afterLogout = await request(app).get('/api/v1/me').set(account.auth);
  assert.equal(logout.status, 204);
  assert.equal(afterLogout.status, 401);

  const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ninguem@estuda.local' });
  assert.equal(unknown.status, 200);

  const logs = [];
  const originalInfo = console.info;
  console.info = message => logs.push(message);
  const forgot = await request(app).post('/api/v1/auth/forgot-password').send({ email: account.email });
  console.info = originalInfo;
  assert.equal(forgot.status, 200);
  assert.equal(forgot.body.message, unknown.body.message);
  const token = logs.join('\n').match(/redefinir=([0-9a-f]{64})/)?.[1];
  assert.ok(token);

  const session = await request(app).post('/api/v1/auth/login').send({ email: account.email, password: 'senha-segura-123' });
  const reset = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'nova-senha-456' });
  const reused = await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'outra-senha-789' });
  assert.equal(reset.status, 200);
  assert.equal(reused.status, 400);

  const oldSession = await request(app).get('/api/v1/me').set({ Authorization: `Bearer ${session.body.token}` });
  const oldPassword = await request(app).post('/api/v1/auth/login').send({ email: account.email, password: 'senha-segura-123' });
  const newPassword = await request(app).post('/api/v1/auth/login').send({ email: account.email, password: 'nova-senha-456' });
  assert.equal(oldSession.status, 401);
  assert.equal(oldPassword.status, 401);
  assert.equal(newPassword.status, 200);
});

test('registra aulas, provas, atividades e cofre com integridade entre registros', async () => {
  const owner = await newAccount('fase1');
  const other = await newAccount('fase1-outra');
  const subject = (await request(app).post('/api/v1/subjects').set(owner.auth).send({ name: 'Cor e Impressão', color: '#7c8cf8' })).body;
  const foreignSubject = (await request(app).post('/api/v1/subjects').set(other.auth).send({ name: 'Alheia', color: '#000000' })).body;

  const lesson = await request(app).post('/api/v1/lessons').set(owner.auth).send({
    subjectId: subject.id, date: '2026-09-14', startTime: '19:00', status: 'presente', theme: 'Modelo CMYK', mastery: 9, draft: true
  });
  assert.equal(lesson.status, 201);
  assert.equal(lesson.body.mastery, 5);
  const duplicate = await request(app).post('/api/v1/lessons').set(owner.auth).send({ subjectId: subject.id, date: '2026-09-14', startTime: '19:00' });
  const badStatus = await request(app).post('/api/v1/lessons').set(owner.auth).send({ subjectId: subject.id, date: '2026-09-15', status: 'estudada' });
  const foreignRef = await request(app).post('/api/v1/lessons').set(owner.auth).send({ subjectId: foreignSubject.id, date: '2026-09-14' });
  assert.equal(duplicate.status, 409);
  assert.equal(badStatus.status, 400);
  assert.equal(foreignRef.status, 400);

  const missed = await request(app).patch(`/api/v1/lessons/${lesson.body.id}`).set(owner.auth).send({ status: 'falta', recovered: true });
  assert.equal(missed.body.status, 'falta');
  assert.equal(missed.body.theme, 'Modelo CMYK');

  const exam = await request(app).post('/api/v1/exams').set(owner.auth).send({
    subjectId: subject.id, title: 'P1', date: '2026-10-20', topics: [{ title: 'CMYK' }, { title: '' }, { title: 'Retícula', status: 'Revisado' }]
  });
  assert.equal(exam.status, 201);
  assert.deepEqual(exam.body.topics.map(topic => [topic.title, topic.status]), [['CMYK', 'Não iniciado'], ['Retícula', 'Revisado']]);

  const task = await request(app).post('/api/v1/tasks').set(owner.auth).send({ subjectId: subject.id, title: 'Paleta impressa', dueDate: '2026-10-01' });
  const done = await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(owner.auth).send({ done: true });
  assert.equal(done.body.done, true);
  assert.equal(done.body.kind, 'Atividade');

  const note = await request(app).post('/api/v1/teacher-notes').set(owner.auth).send({
    subjectId: subject.id, content: 'A P1 terá 10 questões.', lessonId: lesson.body.id, examId: exam.body.id, category: 'Tipo e quantidade de questões'
  });
  assert.equal(note.body.confirmation, 'Confirmado pelo professor');
  const material = await request(app).post('/api/v1/materials').set(owner.auth).send({ title: 'Slides CMYK', type: 'Slides', subjectId: subject.id, lessonId: lesson.body.id });
  assert.equal(material.status, 201);

  assert.deepEqual((await request(app).get('/api/v1/exams').set(other.auth)).body, []);
  assert.equal((await request(app).delete(`/api/v1/exams/${exam.body.id}`).set(other.auth)).status, 404);

  await request(app).delete(`/api/v1/lessons/${lesson.body.id}`).set(owner.auth);
  const detached = await request(app).get(`/api/v1/teacher-notes/${note.body.id}`).set(owner.auth);
  assert.equal(detached.body.lessonId, null);
  assert.equal(detached.body.examId, exam.body.id);

  await request(app).delete(`/api/v1/subjects/${subject.id}`).set(owner.auth);
  const [exams, notes, tasks, materials] = await Promise.all(
    ['exams', 'teacher-notes', 'tasks', 'materials'].map(path => request(app).get(`/api/v1/${path}`).set(owner.auth))
  );
  assert.deepEqual(exams.body, []);
  assert.deepEqual(notes.body, []);
  assert.equal(tasks.body[0].subjectId, null);
  assert.equal(materials.body[0].subjectId, null);
});

test('guarda flashcards e resultados de simulado da própria conta', async () => {
  const owner = await newAccount('cartoes');
  const subject = (await request(app).post('/api/v1/subjects').set(owner.auth).send({ name: 'Física', color: '#4f5bd5' })).body;
  const card = await request(app).post('/api/v1/flashcards').set(owner.auth).send({ subjectId: subject.id, front: 'O que é inércia?', back: 'Tendência de manter o estado de movimento.' });
  assert.equal(card.status, 201);
  assert.equal(card.body.level, 'nova');
  const reviewed = await request(app).patch(`/api/v1/flashcards/${card.body.id}`).set(owner.auth).send({ level: 'difícil', reviews: 1, reviewedOn: '2026-10-12' });
  assert.equal(reviewed.body.level, 'difícil');
  const badLevel = await request(app).patch(`/api/v1/flashcards/${card.body.id}`).set(owner.auth).send({ level: 'médio' });
  assert.equal(badLevel.status, 400);

  const result = await request(app).post('/api/v1/quiz-results').set(owner.auth).send({
    subjectId: subject.id, topic: 'Leis de Newton', total: 4, correct: 3, takenOn: '2026-10-12',
    mistakes: [{ question: 'Q1', chosen: 'A', correct: 'B', explanation: 'Porque…' }, { chosen: 'sem enunciado' }]
  });
  assert.equal(result.status, 201);
  assert.equal(result.body.mistakes.length, 1);
});

test('envia, baixa e protege arquivos de materiais', async () => {
  const owner = await newAccount('arquivos');
  const other = await newAccount('arquivos-outra');
  const material = (await request(app).post('/api/v1/materials').set(owner.auth).send({ title: 'Apostila', type: 'PDF' })).body;
  const content = Buffer.from('%PDF-1.4 conteúdo de teste');
  const upload = await request(app).post('/api/v1/files').set(owner.auth).send({ materialId: material.id, name: 'apostila.pdf', mime: 'application/pdf', data: content.toString('base64') });
  assert.equal(upload.status, 201);
  assert.equal(upload.body.size, content.length);

  const download = await request(app).get(`/api/v1/files/${upload.body.id}`).set(owner.auth).buffer(true).parse((res, done) => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => done(null, Buffer.concat(chunks)));
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers['content-type'], 'application/pdf');
  assert.ok(download.body.equals(content));

  const ticket = await request(app).post(`/api/v1/files/${upload.body.id}/ticket`).set(owner.auth);
  assert.equal(ticket.status, 201);
  const viaTicket = await request(app).get(`/api/v1/files/download/${ticket.body.ticket}`);
  const reusedTicket = await request(app).get(`/api/v1/files/download/${ticket.body.ticket}`);
  const foreignTicket = await request(app).post(`/api/v1/files/${upload.body.id}/ticket`).set(other.auth);
  assert.equal(viaTicket.status, 200);
  assert.equal(viaTicket.headers['content-type'], 'application/pdf');
  assert.equal(reusedTicket.status, 410);
  assert.equal(foreignTicket.status, 404);

  const foreign = await request(app).get(`/api/v1/files/${upload.body.id}`).set(other.auth);
  const foreignMaterial = await request(app).post('/api/v1/files').set(other.auth).send({ materialId: material.id, name: 'x.pdf', mime: 'application/pdf', data: content.toString('base64') });
  const badType = await request(app).post('/api/v1/files').set(owner.auth).send({ materialId: material.id, name: 'x.exe', mime: 'application/x-msdownload', data: content.toString('base64') });
  const tooBig = await request(app).post('/api/v1/files').set(owner.auth).send({ materialId: material.id, name: 'grande.pdf', mime: 'application/pdf', data: Buffer.alloc(3 * 1024 * 1024 + 1).toString('base64') });
  assert.equal(foreign.status, 404);
  assert.equal(foreignMaterial.status, 404);
  assert.equal(badType.status, 400);
  assert.equal(tooBig.status, 413);

  await request(app).delete(`/api/v1/materials/${material.id}`).set(owner.auth);
  const files = await request(app).get('/api/v1/files').set(owner.auth);
  assert.deepEqual(files.body, []);
});

test('valida pedidos das ferramentas de IA antes de chamar o modelo', async () => {
  const { auth } = await newAccount('ia');
  const unknown = await request(app).post('/api/v1/ai/study').set(auth).send({ tool: 'adivinhar', subject: 'Física' });
  const noTopic = await request(app).post('/api/v1/ai/study').set(auth).send({ tool: 'explicar', subject: 'Física' });
  const noConsent = await request(app).post('/api/v1/ai/transcribe').set(auth).send({ mime: 'audio/mpeg', data: 'AAAA' });
  const badAudio = await request(app).post('/api/v1/ai/transcribe').set(auth).send({ mime: 'video/mp4', data: 'AAAA', consent: true });
  assert.equal(unknown.status, 400);
  assert.equal(noTopic.status, 400);
  assert.equal(noConsent.status, 400);
  assert.equal(badAudio.status, 400);
});

test('exclui a conta só com a senha correta e apaga os dados', async () => {
  const account = await newAccount('excluir');
  await request(app).post('/api/v1/subjects').set(account.auth).send({ name: 'Química', color: '#4f5bd5' });
  const wrong = await request(app).delete('/api/v1/me').set(account.auth).send({ password: 'errada-123' });
  assert.equal(wrong.status, 403);
  const removed = await request(app).delete('/api/v1/me').set(account.auth).send({ password: 'senha-segura-123' });
  assert.equal(removed.status, 204);
  assert.equal((await request(app).get('/api/v1/me').set(account.auth)).status, 401);
  assert.equal((await request(app).post('/api/v1/auth/login').send({ email: account.email, password: 'senha-segura-123' })).status, 401);
  const again = await request(app).post('/api/v1/auth/register').send({ name: 'Nova', email: account.email, password: 'senha-segura-123' });
  assert.equal(again.status, 201);
});
