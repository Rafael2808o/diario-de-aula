import { randomUUID } from 'node:crypto';
import { initStore, memory, pool } from './store.js';
import { sanitizeHtml } from './richtext.js';

// Entidades acadêmicas descritas por configuração: a mesma definição gera a tabela, valida a entrada,
// monta as consultas e as rotas REST. Toda linha pertence a um usuário e referências a outras entidades
// só são aceitas quando apontam para registros do mesmo usuário.

const text = (column, max, extra = {}) => ({ column, type: 'text', max, ...extra });
const multiline = (column, max = 4000, extra = {}) => ({ column, type: 'multiline', max, ...extra });
const date = (column, extra = {}) => ({ column, type: 'date', ...extra });
const time = column => ({ column, type: 'time' });
const int = (column, min, max) => ({ column, type: 'int', min, max });
const bool = column => ({ column, type: 'bool' });
const oneOf = (column, values, extra = {}) => ({ column, type: 'enum', values, ...extra });
const ref = (column, table, onDelete, extra = {}) => ({ column, type: 'ref', table, onDelete, ...extra });

export const lessonStatuses = ['pendente', 'presente', 'falta', 'cancelada'];
export const topicStatuses = ['Não iniciado', 'Em estudo', 'Revisado', 'Dominado'];
export const noteCategories = [
  'Formato da prova', 'Conteúdos cobrados', 'Data de avaliação', 'Tipo e quantidade de questões',
  'Orientações para trabalhos', 'Materiais indicados', 'Mudanças de planejamento', 'Outro'
];
export const noteConfirmations = ['Confirmado pelo professor', 'Hipótese pessoal', 'Sugestão da IA'];
export const materialTypes = ['Link', 'PDF', 'Slides', 'Artigo', 'Livro', 'Anotação', 'Foto', 'Documento', 'Áudio'];

function cleanTopics(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 60).flatMap(topic => {
    const title = typeof topic?.title === 'string' ? topic.title.trim().replace(/\s+/g, ' ').slice(0, 160) : '';
    if (!title) return [];
    const id = typeof topic.id === 'string' && /^[\w-]{1,40}$/.test(topic.id) ? topic.id : randomUUID();
    return [{ id, title, status: topicStatuses.includes(topic.status) ? topic.status : 'Não iniciado' }];
  });
}

function cleanMistakes(value) {
  if (!Array.isArray(value)) return [];
  const clip = (text, max) => (typeof text === "string" ? text.trim().slice(0, max) : "");
  return value.slice(0, 50).map(item => ({
    question: clip(item?.question, 600),
    chosen: clip(item?.chosen, 400),
    correct: clip(item?.correct, 400),
    explanation: clip(item?.explanation, 1200)
  })).filter(item => item.question);
}

export const entities = {
  lessons: {
    table: 'lessons', schema: 'Lesson', label: 'Registro de aula', order: 'lesson_date DESC, start_time DESC',
    unique: ['subject_id', 'lesson_date', 'start_time'],
    conflict: 'Já existe um registro para esta aula. Abra o registro existente para editar.',
    fields: {
      subjectId: ref('subject_id', 'subjects', 'CASCADE', { required: 'Escolha a disciplina da aula.' }),
      date: date('lesson_date', { required: 'Informe a data da aula.' }),
      startTime: time('start_time'),
      status: oneOf('status', lessonStatuses, { default: 'pendente' }),
      expected: multiline('expected', 2000),
      theme: text('theme', 180),
      taught: multiline('taught', 8000),
      notes: multiline('notes'),
      examInfo: multiline('exam_info'),
      mastery: int('mastery', 0, 5),
      missedContent: multiline('missed_content'),
      transcript: multiline('transcript', 50000),
      recovered: bool('recovered'),
      draft: bool('draft'),
      // Vínculo manual com uma prova; sem ele, a prova reúne as aulas da disciplina pelo período.
      examId: ref('exam_id', 'exams', 'SET NULL'),
      // Marcado pela pessoa: o professor não disponibilizou material nesta aula (diferente de "ainda não anexado").
      noMaterial: bool('no_material'),
      // Caderno da aula, escrito durante a explicação (HTML limpo pelo editor; ver richtext.js).
      annotations: { column: 'annotations', type: 'html', max: 60000 }
    }
  },
  exams: {
    table: 'exams', schema: 'Exam', label: 'Avaliação', order: 'exam_date ASC, exam_time ASC',
    fields: {
      subjectId: ref('subject_id', 'subjects', 'CASCADE', { required: 'Escolha a disciplina da avaliação.' }),
      title: text('title', 160, { required: 'Dê um nome para a avaliação.' }),
      date: date('exam_date', { required: 'Informe a data da avaliação.' }),
      time: time('exam_time'),
      location: text('location', 100),
      format: text('format', 80),
      topics: { column: 'topics', type: 'json', clean: cleanTopics, fallback: [] },
      instructions: multiline('instructions'),
      questionsInfo: multiline('questions_info', 1000),
      references: multiline('references_text', 2000),
      personalNotes: multiline('personal_notes'),
      prepStatus: oneOf('prep_status', ['Não iniciada', 'Em andamento', 'Revisão final', 'Pronto'], { default: 'Não iniciada' })
    }
  },
  tasks: {
    table: 'tasks', schema: 'Task', label: 'Atividade', order: 'done ASC, due_date ASC, due_time ASC',
    fields: {
      subjectId: ref('subject_id', 'subjects', 'SET NULL'),
      title: text('title', 160, { required: 'Dê um nome para a atividade.' }),
      kind: oneOf('kind', ['Trabalho', 'Atividade', 'Entrega', 'Lista de exercícios', 'Outro'], { default: 'Atividade' }),
      dueDate: date('due_date', { required: 'Informe o prazo.' }),
      dueTime: time('due_time'),
      notes: multiline('notes'),
      done: bool('done')
    }
  },
  events: {
    table: 'calendar_events', schema: 'CalendarEvent', label: 'Evento', order: 'event_date ASC, start_time ASC',
    fields: {
      subjectId: ref('subject_id', 'subjects', 'SET NULL'),
      title: text('title', 160, { required: 'Dê um nome para o evento.' }),
      kind: oneOf('kind', ['Sessão de estudo', 'Compromisso', 'Outro'], { default: 'Compromisso' }),
      date: date('event_date', { required: 'Informe a data do evento.' }),
      startTime: time('start_time'),
      endTime: time('end_time'),
      notes: multiline('notes', 2000),
      reminderMinutes: int('reminder_minutes', 0, 10080),
      examId: ref('exam_id', 'exams', 'SET NULL'),
      done: bool('done')
    }
  },
  'teacher-notes': {
    table: 'teacher_notes', schema: 'TeacherNote', label: 'Informação do professor', order: 'informed_on DESC, created_at DESC',
    fields: {
      subjectId: ref('subject_id', 'subjects', 'CASCADE', { required: 'Escolha a disciplina.' }),
      content: multiline('content', 4000, { required: 'Escreva a informação.' }),
      informedOn: date('informed_on'),
      lessonId: ref('lesson_id', 'lessons', 'SET NULL'),
      examId: ref('exam_id', 'exams', 'SET NULL'),
      taskId: ref('task_id', 'tasks', 'SET NULL'),
      category: oneOf('category', noteCategories, { default: 'Outro' }),
      confirmation: oneOf('confirmation', noteConfirmations, { default: 'Confirmado pelo professor' })
    }
  },
  flashcards: {
    table: 'flashcards', schema: 'Flashcard', label: 'Flashcard', order: 'created_at DESC',
    fields: {
      subjectId: ref('subject_id', 'subjects', 'CASCADE', { required: 'Escolha a disciplina do cartão.' }),
      examId: ref('exam_id', 'exams', 'SET NULL'),
      front: text('front', 300, { required: 'Escreva a pergunta.' }),
      back: multiline('back', 1200, { required: 'Escreva a resposta.' }),
      level: oneOf('level', ['nova', 'difícil', 'dúvida', 'fácil'], { default: 'nova' }),
      reviews: int('reviews', 0, 10000),
      reviewedOn: date('reviewed_on'),
      origin: oneOf('origin', ['Criado por você', 'Sugestão da IA'], { default: 'Criado por você' })
    }
  },
  'quiz-results': {
    table: 'quiz_results', schema: 'QuizResult', label: 'Resultado de simulado', order: 'taken_on DESC, created_at DESC',
    fields: {
      subjectId: ref('subject_id', 'subjects', 'CASCADE', { required: 'Escolha a disciplina.' }),
      examId: ref('exam_id', 'exams', 'SET NULL'),
      topic: text('topic', 180),
      total: int('total', 1, 50),
      correct: int('correct', 0, 50),
      takenOn: date('taken_on', { required: 'Informe a data.' }),
      mistakes: { column: 'mistakes', type: 'json', clean: cleanMistakes, fallback: [] }
    }
  },
  'study-sessions': {
    table: 'study_sessions', schema: 'StudySession', label: 'Sessão de estudo', order: 'session_date DESC, start_time DESC',
    // A chave vem do navegador: reenviar a mesma sessão devolve conflito em vez de duplicar.
    unique: ['client_id'],
    conflict: 'Esta sessão já foi salva.',
    fields: {
      clientId: text('client_id', 64, { required: 'Sessão sem identificação.' }),
      subjectId: ref('subject_id', 'subjects', 'SET NULL'),
      date: date('session_date', { required: 'Informe a data da sessão.' }),
      startTime: time('start_time'),
      durationSeconds: int('duration_seconds', 1, 86400),
      notes: multiline('notes', 1000)
    }
  },
  materials: {
    table: 'study_materials', schema: 'Material', label: 'Material', order: 'created_at DESC',
    fields: {
      title: text('title', 180, { required: 'Informe um título para o material.' }),
      type: oneOf('material_type', materialTypes, { required: 'Escolha um tipo de material válido.' }),
      subject: text('subject', 100),
      subjectId: ref('subject_id', 'subjects', 'SET NULL'),
      lessonId: ref('lesson_id', 'lessons', 'SET NULL'),
      examId: ref('exam_id', 'exams', 'SET NULL'),
      url: { column: 'url', type: 'url', max: 1000 },
      notes: multiline('notes', 2000)
    }
  }
};

const sqlType = field => ({ int: 'INTEGER DEFAULT 0', bool: 'BOOLEAN DEFAULT FALSE', json: "TEXT DEFAULT '[]'" }[field.type] || "TEXT DEFAULT ''");
const blank = field => (field.type === 'ref' ? null : ({ int: 0, bool: false, json: field.fallback }[field.type] ?? field.default ?? ''));
const memoryRows = table => (table === 'subjects' ? memory.subjects : (memory.entities ||= {})[table] ||= []);

let ready;
export function initEntities() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    // Primeiro todas as tabelas, depois as colunas: uma referência pode apontar para uma tabela definida mais abaixo.
    await pool.query(Object.values(entities).map(config => `CREATE TABLE IF NOT EXISTS ${config.table} (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`).join(';\n'));
    for (const config of Object.values(entities)) {
      const statements = [];
      for (const field of Object.values(config.fields)) {
        const definition = field.type === 'ref'
          ? `TEXT REFERENCES ${entityTable(field.table)}(id) ON DELETE ${field.onDelete}`
          : sqlType(field);
        statements.push(`ALTER TABLE ${config.table} ADD COLUMN IF NOT EXISTS ${field.column} ${definition}`);
      }
      statements.push(`CREATE INDEX IF NOT EXISTS ${config.table}_user_idx ON ${config.table}(user_id)`);
      if (config.unique) {
        statements.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${config.table}_unique_idx ON ${config.table}(user_id, ${config.unique.join(', ')})`);
      }
      await pool.query(statements.join(';\n'));
    }
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}
const entityTable = name => (name === 'subjects' ? 'subjects' : entities[name]?.table || name);

async function ownsReference(userId, table, id) {
  const physical = entityTable(table);
  if (pool) return (await pool.query(`SELECT 1 FROM ${physical} WHERE id=$1 AND user_id=$2`, [id, userId])).rowCount > 0;
  return memoryRows(physical).some(row => row.id === id && row.userId === userId);
}

// Valida a entrada inteira (registro existente + alterações). Devolve { item } ou { error }.
export async function cleanEntity(config, userId, input) {
  const item = {};
  for (const [key, field] of Object.entries(config.fields)) {
    let value = input[key];
    if (field.type === 'json') value = field.clean(value);
    else if (field.type === 'bool') value = Boolean(value);
    else if (field.type === 'html') value = sanitizeHtml(value, field.max);
    else if (field.type === 'int') {
      const number = Number.parseInt(value, 10);
      value = Number.isFinite(number) ? Math.max(field.min, Math.min(field.max, number)) : 0;
    } else if (field.type === 'ref') {
      value = typeof value === 'string' && value ? value.slice(0, 64) : null;
      if (value && !(await ownsReference(userId, field.table, value))) {
        return { error: `${field.required ? 'O registro relacionado' : 'Um registro relacionado'} não foi encontrado.` };
      }
    } else {
      value = typeof value === 'string' ? value.trim() : '';
      if (field.type === 'text') value = value.replace(/\s+/g, ' ').slice(0, field.max);
      if (field.type === 'multiline' || field.type === 'url') value = value.slice(0, field.max || 4000);
      if (field.type === 'date' && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { error: 'Use uma data válida.' };
      if (field.type === 'time' && value && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return { error: 'Use um horário válido.' };
      if (field.type === 'url' && value && !/^https?:\/\//i.test(value)) return { error: 'O link precisa começar com http:// ou https://.' };
      if (field.type === 'enum') {
        if (!value && field.default) value = field.default;
        if (value && !field.values.includes(value)) return { error: field.required || `Escolha uma opção válida para ${key}.` };
      }
    }
    if (field.required && (value === '' || value === null)) return { error: field.required };
    item[key] = value;
  }
  return { item };
}

const selectList = config =>
  ['id', ...Object.entries(config.fields).map(([key, field]) => `${field.column} AS "${key}"`)].join(', ');

function fromRow(config, row) {
  if (!row) return null;
  const item = { id: row.id };
  for (const [key, field] of Object.entries(config.fields)) {
    let value = row[key];
    if (field.type === 'json') {
      try { value = typeof value === 'string' ? JSON.parse(value) : value; } catch { value = field.fallback; }
    }
    item[key] = value ?? blank(field);
  }
  return item;
}

const toColumnValue = (field, value) => (field.type === 'json' ? JSON.stringify(value) : value);

function compareForOrder(config) {
  // Ordenação equivalente ao ORDER BY usada no modo em memória.
  const parts = config.order.split(',').map(part => {
    const [column, direction] = part.trim().split(/\s+/);
    const key = column === 'created_at' ? '_createdAt' : Object.keys(config.fields).find(name => config.fields[name].column === column);
    return { key, sign: direction === 'DESC' ? -1 : 1 };
  });
  return (a, b) => {
    for (const { key, sign } of parts) {
      const left = a[key] ?? '';
      const right = b[key] ?? '';
      if (left < right) return -sign;
      if (left > right) return sign;
    }
    return 0;
  };
}

export async function listEntity(config, userId) {
  await initEntities();
  if (pool) return (await pool.query(`SELECT ${selectList(config)} FROM ${config.table} WHERE user_id=$1 ORDER BY ${config.order}`, [userId])).rows.map(row => fromRow(config, row));
  return memoryRows(config.table).filter(row => row.userId === userId).sort(compareForOrder(config)).map(row => fromRow(config, row));
}

export async function getEntity(config, userId, id) {
  await initEntities();
  if (pool) return fromRow(config, (await pool.query(`SELECT ${selectList(config)} FROM ${config.table} WHERE id=$1 AND user_id=$2`, [id, userId])).rows[0]);
  return fromRow(config, memoryRows(config.table).find(row => row.id === id && row.userId === userId));
}

function memoryConflict(config, userId, item, id) {
  if (!config.unique) return false;
  const keys = config.unique.map(column => Object.keys(config.fields).find(name => config.fields[name].column === column));
  return memoryRows(config.table).some(row => row.userId === userId && row.id !== id && keys.every(key => row[key] === item[key]));
}

export async function createEntity(config, userId, item) {
  await initEntities();
  const id = randomUUID();
  if (pool) {
    const fields = Object.entries(config.fields);
    const columns = ['id', 'user_id', ...fields.map(([, field]) => field.column)];
    const values = [id, userId, ...fields.map(([key, field]) => toColumnValue(field, item[key]))];
    await pool.query(`INSERT INTO ${config.table} (${columns.join(',')}) VALUES (${columns.map((_, index) => `$${index + 1}`).join(',')})`, values);
  } else {
    if (memoryConflict(config, userId, item)) throw Object.assign(new Error('conflict'), { code: '23505' });
    memoryRows(config.table).push({ id, userId, _createdAt: new Date().toISOString(), ...item });
  }
  return { id, ...item };
}

export async function updateEntity(config, userId, id, item) {
  await initEntities();
  if (pool) {
    const fields = Object.entries(config.fields);
    const assignments = fields.map(([, field], index) => `${field.column}=$${index + 3}`).join(',');
    const result = await pool.query(`UPDATE ${config.table} SET ${assignments}, updated_at=NOW() WHERE id=$1 AND user_id=$2`,
      [id, userId, ...fields.map(([key, field]) => toColumnValue(field, item[key]))]);
    return result.rowCount ? { id, ...item } : null;
  }
  const row = memoryRows(config.table).find(entry => entry.id === id && entry.userId === userId);
  if (!row) return null;
  if (memoryConflict(config, userId, item, id)) throw Object.assign(new Error('conflict'), { code: '23505' });
  Object.assign(row, item);
  return { id, ...item };
}

// Reproduz em memória o ON DELETE das chaves estrangeiras do PostgreSQL.
export function cascadeMemory(table, id) {
  if (table === 'study_materials' && memory.files) memory.files = memory.files.filter(file => file.materialId !== id);
  for (const config of Object.values(entities)) {
    for (const [key, field] of Object.entries(config.fields)) {
      if (field.type !== 'ref' || entityTable(field.table) !== table) continue;
      const rows = memoryRows(config.table);
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (rows[index][key] !== id) continue;
        if (field.onDelete === 'CASCADE') {
          const [removed] = rows.splice(index, 1);
          cascadeMemory(config.table, removed.id);
        } else rows[index][key] = null;
      }
    }
  }
}

export async function removeEntity(config, userId, id) {
  await initEntities();
  if (pool) return (await pool.query(`DELETE FROM ${config.table} WHERE id=$1 AND user_id=$2`, [id, userId])).rowCount > 0;
  const rows = memoryRows(config.table);
  const index = rows.findIndex(row => row.id === id && row.userId === userId);
  if (index < 0) return false;
  rows.splice(index, 1);
  cascadeMemory(config.table, id);
  return true;
}

export function registerEntityRoutes(app, requireAuth) {
  for (const [path, config] of Object.entries(entities)) {
    const base = `/api/v1/${path}`;
    const handle = action => async (req, res, next) => {
      try {
        return await action(req, res);
      } catch (error) {
        if (error.code === '23505') return res.status(409).json({ error: config.conflict || 'Este registro já existe.' });
        return next(error);
      }
    };
    app.get(base, requireAuth, handle(async (req, res) => res.json(await listEntity(config, req.user.id))));
    app.get(`${base}/:id`, requireAuth, handle(async (req, res) => {
      const item = await getEntity(config, req.user.id, req.params.id);
      return item ? res.json(item) : res.status(404).json({ error: `${config.label} não encontrado(a).` });
    }));
    app.post(base, requireAuth, handle(async (req, res) => {
      const { item, error } = await cleanEntity(config, req.user.id, req.body || {});
      if (error) return res.status(400).json({ error });
      return res.status(201).json(await createEntity(config, req.user.id, item));
    }));
    // PATCH mescla as alterações sobre o registro atual e revalida tudo antes de gravar.
    app.patch(`${base}/:id`, requireAuth, handle(async (req, res) => {
      const current = await getEntity(config, req.user.id, req.params.id);
      if (!current) return res.status(404).json({ error: `${config.label} não encontrado(a).` });
      const { item, error } = await cleanEntity(config, req.user.id, { ...current, ...(req.body || {}) });
      if (error) return res.status(400).json({ error });
      return res.json(await updateEntity(config, req.user.id, req.params.id, item));
    }));
    app.delete(`${base}/:id`, requireAuth, handle(async (req, res) => {
      const removed = await removeEntity(config, req.user.id, req.params.id);
      return removed ? res.status(204).end() : res.status(404).json({ error: `${config.label} não encontrado(a).` });
    }));
  }
}

export function entitySchemas() {
  const schemaType = field => ({
    int: { type: 'integer', minimum: field.min, maximum: field.max },
    bool: { type: 'boolean' },
    json: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, status: { type: 'string', enum: topicStatuses } } } },
    date: { type: 'string', format: 'date' },
    time: { type: 'string', example: '19:00' },
    enum: { type: 'string', enum: field.values },
    url: { type: 'string', format: 'uri' },
    html: { type: 'string', description: 'HTML simples (p, h2, h3, strong, em, u, ul, ol, li, blockquote), sem atributos' },
    ref: { type: 'string', format: 'uuid', nullable: true, description: `Id em ${field.table}` }
  }[field.type] || { type: 'string', maxLength: field.max });
  const schemas = {};
  const paths = {};
  for (const [path, config] of Object.entries(entities)) {
    const name = config.schema;
    schemas[name] = {
      type: 'object',
      required: Object.entries(config.fields).filter(([, field]) => field.required).map(([key]) => key),
      properties: {
        id: { type: 'string', format: 'uuid', readOnly: true },
        ...Object.fromEntries(Object.entries(config.fields).map(([key, field]) => [key, schemaType(field)]))
      }
    };
    const security = [{ bearerAuth: [] }];
    const body = { required: true, content: { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } } };
    const idParam = [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }];
    paths[`/${path}`] = {
      get: { summary: `Lista: ${config.label}`, security, responses: { 200: { description: 'OK' } } },
      post: { summary: `Cria: ${config.label}`, security, requestBody: body, responses: { 201: { description: 'Criado' }, 400: { description: 'Dados inválidos' } } }
    };
    paths[`/${path}/{id}`] = {
      get: { summary: `Obtém: ${config.label}`, security, parameters: idParam, responses: { 200: { description: 'OK' }, 404: { description: 'Não encontrado' } } },
      patch: { summary: `Atualiza: ${config.label}`, security, parameters: idParam, requestBody: body, responses: { 200: { description: 'Atualizado' } } },
      delete: { summary: `Remove: ${config.label}`, security, parameters: idParam, responses: { 204: { description: 'Removido' } } }
    };
  }
  return { schemas, paths };
}
