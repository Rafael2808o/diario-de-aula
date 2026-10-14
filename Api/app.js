import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'node:url';
import {
  addPlan,
  addSubject,
  createPasswordReset,
  createUser,
  deleteUser,
  endSession,
  hasDatabase,
  initStore,
  listDiaries,
  listPlans,
  listSubjects,
  loginUser,
  removePlan,
  removeSubject,
  reorderSubjects,
  resetPassword,
  saveDiary,
  updateSubject,
  updateUser,
  userFromToken
} from './store.js';
import { cascadeMemory, entitySchemas, initEntities, registerEntityRoutes } from './entities.js';
import { registerAiRoutes } from './ai.js';
import { registerFileRoutes } from './files.js';

const app = express();
const corsOrigins = (process.env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
app.use(cors({ origin: corsOrigins.length ? corsOrigins : true }));
// Arquivos e áudio usam um limite maior, aplicado na própria rota.
const smallJson = express.json({ limit: '120kb' });
const largeBodyRoutes = new Set(['/api/v1/files', '/api/v1/ai/transcribe']);
app.use((req, res, next) => (req.method === 'POST' && largeBodyRoutes.has(req.path) ? next() : smallJson(req, res, next)));


const cleanText = (value, max) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const cleanMultiline = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const spotifyConfigured = () => Boolean(process.env.SPOTIFY_CLIENT_ID);
const mailConfigured = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
const bearerToken = req => req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];

const weekdays = new Set(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
const shifts = new Set(['', 'Manhã', 'Tarde', 'Noite', 'Integral']);
const organizationModes = new Set(['', 'Por disciplina', 'Por prazo', 'Por prioridade']);
const isTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
const isDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
const isMonth = value => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const isColor = value => /^#[0-9a-f]{6}$/i.test(value);

// Mantém só faixas válidas (dia conhecido, início antes do fim); entradas incompletas são descartadas, não rejeitadas.
function cleanSlots(value, withRoom) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 14).flatMap(slot => {
    const day = cleanText(slot?.day, 3);
    const start = cleanText(slot?.start, 5);
    const end = cleanText(slot?.end, 5);
    if (!weekdays.has(day) || !isTime(start) || !isTime(end) || start >= end) return [];
    return [withRoom ? { day, start, end, room: cleanText(slot?.room, 60) } : { day, start, end }];
  });
}

function cleanPreferences(value, current = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const minutes = Number.parseInt(input.studyMinutes, 10);
  const reminders = input.reminders && typeof input.reminders === 'object' ? input.reminders : current.reminders || {};
  const organization = cleanText(input.organization, 30);
  return {
    studyMinutes: Number.isFinite(minutes) ? Math.max(0, Math.min(720, minutes)) : current.studyMinutes || 0,
    studySlots: input.studySlots !== undefined ? cleanSlots(input.studySlots, false) : current.studySlots || [],
    reminders: {
      classes: Boolean(reminders.classes),
      exams: Boolean(reminders.exams),
      study: Boolean(reminders.study)
    },
    organization: organizationModes.has(organization) ? organization : current.organization || ''
  };
}

function subjectInput(body) {
  const name = cleanText(body.name, 100);
  const color = cleanText(body.color, 7);
  const startDate = cleanText(body.startDate, 10);
  const endDate = cleanText(body.endDate, 10);
  if (!name) return { error: 'Informe o nome da disciplina.' };
  if (!isColor(color)) return { error: 'Escolha uma cor válida para a disciplina.' };
  if ((startDate && !isDate(startDate)) || (endDate && !isDate(endDate))) return { error: 'Use datas válidas para o período.' };
  if (startDate && endDate && startDate > endDate) return { error: 'O início do período precisa vir antes do fim.' };
  return { subject: { name, professor: cleanText(body.professor, 100), color, schedule: cleanSlots(body.schedule, true), startDate, endDate } };
}

async function sendResetEmail({ name, email, link }) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({
      from: process.env.MAIL_FROM,
      to: email,
      subject: 'Redefinição de senha',
      text: `Olá, ${name}.\n\nRecebemos um pedido para redefinir sua senha. Abra o link abaixo em até 1 hora:\n\n${link}\n\nSe não foi você, ignore este e-mail; sua senha continua a mesma.`
    })
  });
  if (!response.ok) throw new Error(`Resend respondeu ${response.status}`);
}

async function requireAuth(req, res, next) {
  try {
    const user = await userFromToken(bearerToken(req));
    if (!user) return res.status(401).json({ error: 'Entre na sua conta para continuar.' });
    req.user = user;
    return next();
  } catch (error) {
    return next(error);
  }
}

const aiWindows = new Map();
function aiRateLimit(req, res, next) {
  const key = req.user?.id || req.ip;
  const now = Date.now();
  const requests = (aiWindows.get(key) || []).filter(time => now - time < 60_000);
  if (requests.length >= 10) {
    return res.status(429).json({ error: 'Limite de revisões atingido. Aguarde um minuto.' });
  }
  requests.push(now);
  aiWindows.set(key, requests);
  return next();
}

const requestBody = schema => ({
  required: true,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } }
});
const jsonResponse = (description, schema) => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } }
});

const entityDocs = entitySchemas();
const swagger = {
  openapi: '3.0.3',
  info: {
    title: 'Diário de Aula API',
    version: '2.0.0',
    description: 'API de contas, planejamento, diário e revisão acadêmica com IA.'
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer' }
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          course: { type: 'string' },
          institution: { type: 'string' },
          semester: { type: 'string' },
          classDays: { type: 'array', items: { type: 'string' } },
          classTime: { type: 'string' },
          shift: { type: 'string', enum: [...shifts] },
          termStart: { type: 'string', example: '2026-08' },
          termEnd: { type: 'string', example: '2026-12' },
          preferences: {
            type: 'object',
            properties: {
              studyMinutes: { type: 'integer', minimum: 0, maximum: 720 },
              studySlots: { type: 'array', items: { $ref: '#/components/schemas/TimeSlot' } },
              reminders: { type: 'object', properties: { classes: { type: 'boolean' }, exams: { type: 'boolean' }, study: { type: 'boolean' } } },
              organization: { type: 'string', enum: [...organizationModes] }
            }
          },
          onboardingDone: { type: 'boolean' }
        }
      },
      TimeSlot: {
        type: 'object', required: ['day', 'start', 'end'],
        properties: {
          day: { type: 'string', enum: [...weekdays] }, start: { type: 'string', example: '19:00' },
          end: { type: 'string', example: '20:40' }, room: { type: 'string' }
        }
      },
      Subject: {
        type: 'object', required: ['name', 'color'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true }, name: { type: 'string' }, professor: { type: 'string' },
          color: { type: 'string', example: '#7c8cf8' }, schedule: { type: 'array', items: { $ref: '#/components/schemas/TimeSlot' } },
          startDate: { type: 'string', format: 'date' }, endDate: { type: 'string', format: 'date' },
          position: { type: 'integer', readOnly: true }
        }
      },
      ResetInput: {
        type: 'object', required: ['token', 'password'],
        properties: { token: { type: 'string' }, password: { type: 'string', format: 'password', minLength: 8 } }
      },
      RegisterInput: {
        type: 'object', required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          password: { type: 'string', format: 'password', minLength: 8 },
          course: { type: 'string' }, institution: { type: 'string' }, semester: { type: 'string' }
        }
      },
      LoginInput: {
        type: 'object', required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', format: 'password' } }
      },
      Session: {
        type: 'object',
        properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } }
      },
      StudyPlan: {
        type: 'object', required: ['subject', 'topic', 'priority'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true }, subject: { type: 'string' }, topic: { type: 'string' },
          date: { type: 'string', format: 'date' }, time: { type: 'string' }, priority: { type: 'string', enum: ['Alta', 'Média', 'Baixa'] }
        }
      },
      Diary: {
        type: 'object', required: ['subject', 'date'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true }, subject: { type: 'string' }, date: { type: 'string', format: 'date' },
          planned: { type: 'string' }, actual: { type: 'string' }, reached: { type: 'string' }, understood: { type: 'string' },
          doubts: { type: 'string' }, notes: { type: 'string' }, references: { type: 'string' }
        }
      },
      QuestionRequest: {
        type: 'object', required: ['subject', 'topic'],
        properties: { subject: { type: 'string' }, topic: { type: 'string' }, context: { type: 'string', maxLength: 3000 }, quantity: { type: 'integer', minimum: 1, maximum: 10 } }
      },
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      ...entityDocs.schemas
    }
  },
  paths: {
    ...entityDocs.paths,
    '/openapi.json': { get: { summary: 'Contrato OpenAPI em JSON', responses: { 200: { description: 'Documento OpenAPI' } } } },
    '/auth/register': { post: { summary: 'Cria uma conta', requestBody: requestBody('RegisterInput'), responses: { 201: jsonResponse('Conta criada', 'Session'), 409: jsonResponse('E-mail já cadastrado', 'Error') } } },
    '/auth/login': { post: { summary: 'Autentica uma conta', requestBody: requestBody('LoginInput'), responses: { 200: jsonResponse('Autenticado', 'Session'), 401: jsonResponse('Credenciais inválidas', 'Error') } } },
    '/auth/logout': { post: { summary: 'Encerra a sessão atual', security: [{ bearerAuth: [] }], responses: { 204: { description: 'Sessão encerrada' } } } },
    '/auth/forgot-password': {
      post: {
        summary: 'Envia link de redefinição de senha',
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } },
        responses: { 200: { description: 'Resposta igual com ou sem conta cadastrada' }, 429: jsonResponse('Muitos pedidos', 'Error'), 503: jsonResponse('E-mail não configurado', 'Error') }
      }
    },
    '/auth/reset-password': { post: { summary: 'Define nova senha com o token recebido', requestBody: requestBody('ResetInput'), responses: { 200: { description: 'Senha redefinida' }, 400: jsonResponse('Token inválido ou expirado', 'Error') } } },
    '/subjects': {
      get: { summary: 'Lista disciplinas na ordem definida', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      post: { summary: 'Cadastra disciplina', security: [{ bearerAuth: [] }], requestBody: requestBody('Subject'), responses: { 201: jsonResponse('Criada', 'Subject') } }
    },
    '/subjects/order': {
      put: {
        summary: 'Reordena disciplinas', security: [{ bearerAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string' } } } } } } },
        responses: { 200: { description: 'Lista na nova ordem' } }
      }
    },
    '/subjects/{id}': {
      put: { summary: 'Atualiza disciplina', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], requestBody: requestBody('Subject'), responses: { 200: jsonResponse('Atualizada', 'Subject'), 404: jsonResponse('Não encontrada', 'Error') } },
      delete: { summary: 'Remove disciplina', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Removida' } } }
    },
    '/files': {
      get: { summary: 'Lista arquivos enviados', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      post: { summary: 'Envia arquivo (base64, até 3 MB) ligado a um material', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Enviado' }, 413: { description: 'Arquivo grande demais ou cota cheia' } } }
    },
    '/files/{id}': {
      get: { summary: 'Baixa o arquivo', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Conteúdo binário' } } },
      delete: { summary: 'Remove o arquivo', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Removido' } } }
    },
    '/ai/study': { post: { summary: 'Pede resumo, flashcards ou explicação; responde 202 com jobId', security: [{ bearerAuth: [] }], responses: { 202: { description: 'Pedido aceito; consulte /ai/jobs/{id}' } } } },
    '/ai/transcribe': { post: { summary: 'Pede transcrição e resumo de um áudio autorizado; responde 202 com jobId', security: [{ bearerAuth: [] }], responses: { 202: { description: 'Pedido aceito; consulte /ai/jobs/{id}' } } } },
    '/me': {
      delete: { summary: 'Exclui a conta e todos os dados (exige senha)', security: [{ bearerAuth: [] }], responses: { 204: { description: 'Conta excluída' }, 403: { description: 'Senha incorreta' } } },
      get: { summary: 'Obtém o perfil', security: [{ bearerAuth: [] }], responses: { 200: jsonResponse('Perfil', 'User') } },
      patch: { summary: 'Atualiza o perfil', security: [{ bearerAuth: [] }], requestBody: requestBody('User'), responses: { 200: jsonResponse('Atualizado', 'User') } }
    },
    '/study-plans': {
      get: { summary: 'Lista o planejamento', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      post: { summary: 'Cria item de estudo', security: [{ bearerAuth: [] }], requestBody: requestBody('StudyPlan'), responses: { 201: jsonResponse('Criado', 'StudyPlan') } }
    },
    '/study-plans/{id}': {
      delete: {
        summary: 'Conclui e remove item',
        security: [{ bearerAuth: [] }],
        parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'Removido' } }
      }
    },
    '/diaries': {
      get: { summary: 'Lista registros do diário', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      put: { summary: 'Cria ou atualiza um registro', security: [{ bearerAuth: [] }], requestBody: requestBody('Diary'), responses: { 200: jsonResponse('Salvo', 'Diary') } }
    },
    '/ai/jobs/{id}': { get: { summary: 'Consulta um pedido de IA (pendente, pronto ou erro) e devolve o resultado', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'Situação do pedido' }, 404: { description: 'Não encontrado' } } } },
    '/ai/status': { get: { summary: 'Informa se a IA está configurada', responses: { 200: { description: 'OK' } } } },
    '/ai/questions': {
      post: { summary: 'Pede um simulado à IA; responde 202 com jobId', security: [{ bearerAuth: [] }], requestBody: requestBody('QuestionRequest'), responses: { 202: { description: 'Pedido aceito; consulte /ai/jobs/{id}' }, 429: jsonResponse('Limite temporário atingido', 'Error') } }
    },
    '/integrations/spotify/status': { get: { summary: 'Consulta a integração Spotify', responses: { 200: { description: 'OK' } } } }
  }
};

app.get('/health/ready', async (_req, res, next) => {
  try {
    await initStore();
    return res.json({ status: 'ready', persistence: hasDatabase() ? 'postgresql' : 'memory' });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/v1/openapi.json', (_req, res) => res.json(swagger));
app.post('/api/v1/auth/register', async (req, res, next) => {
  try {
    const name = cleanText(req.body.name, 80);
    const email = cleanText(req.body.email, 140).toLowerCase();
    const password = req.body.password;
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Informe nome, e-mail válido e uma senha de pelo menos 8 caracteres.' });
    }
    const session = await createUser({
      name,
      email,
      password,
      course: cleanText(req.body.course, 100),
      institution: cleanText(req.body.institution, 100),
      semester: cleanText(req.body.semester, 40)
    });
    if (!session) return res.status(409).json({ error: 'Já existe uma conta com este e-mail.' });
    return res.status(201).json(session);
  } catch (error) {
    return next(error);
  }
});

app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const session = await loginUser(cleanText(req.body.email, 140), req.body.password || '');
    return session ? res.json(session) : res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/v1/auth/logout', async (req, res, next) => {
  try {
    await endSession(bearerToken(req));
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});

const resetWindows = new Map();
app.post('/api/v1/auth/forgot-password', async (req, res, next) => {
  const email = cleanText(req.body.email, 140).toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  const now = Date.now();
  const recent = (resetWindows.get(email) || []).filter(time => now - time < 15 * 60_000);
  if (recent.length >= 5) return res.status(429).json({ error: 'Muitos pedidos de recuperação para este e-mail. Aguarde alguns minutos.' });
  resetWindows.set(email, [...recent, now]);
  const production = process.env.NODE_ENV === 'production';
  if (production && !mailConfigured()) {
    return res.status(503).json({ error: 'A recuperação por e-mail ainda não está disponível. Fale com o suporte.' });
  }
  try {
    const reset = await createPasswordReset(email);
    if (reset) {
      const origin = (process.env.APP_URL || req.get('origin') || 'http://localhost:5173').replace(/\/$/, '');
      const link = `${origin}/?redefinir=${reset.token}`;
      if (mailConfigured()) await sendResetEmail({ ...reset, link });
      else console.info(`[auth] Link de redefinição (somente desenvolvimento): ${link}`);
    }
    // A resposta é a mesma com ou sem conta, para não revelar quais e-mails estão cadastrados.
    return res.json({ message: 'Se houver uma conta com este e-mail, enviaremos um link para redefinir a senha.' });
  } catch (error) {
    return next(error);
  }
});

app.post('/api/v1/auth/reset-password', async (req, res, next) => {
  try {
    const token = cleanText(req.body.token, 128);
    const password = req.body.password;
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' });
    }
    if (!/^[0-9a-f]{64}$/.test(token) || !(await resetPassword(token, password))) {
      return res.status(400).json({ error: 'Este link de redefinição é inválido ou expirou. Peça um novo.' });
    }
    return res.json({ message: 'Senha redefinida. Entre com a nova senha.' });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/v1/me', requireAuth, (req, res) => res.json(req.user));
app.delete('/api/v1/me', requireAuth, async (req, res, next) => {
  try {
    if (typeof req.body?.password !== 'string' || !(await deleteUser(req.user.id, req.body.password))) {
      return res.status(403).json({ error: 'Senha incorreta. A conta não foi excluída.' });
    }
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
});
app.patch('/api/v1/me', requireAuth, async (req, res, next) => {
  try {
    const classDays = Array.isArray(req.body.classDays)
      ? req.body.classDays.filter(day => weekdays.has(day)).join(',')
      : req.user.classDays.join(',');
    const changes = {
      name: cleanText(req.body.name, 80) || req.user.name,
      course: req.body.course !== undefined ? cleanText(req.body.course, 100) : req.user.course,
      institution: req.body.institution !== undefined ? cleanText(req.body.institution, 100) : req.user.institution,
      semester: req.body.semester !== undefined ? cleanText(req.body.semester, 40) : req.user.semester,
      classDays,
      classTime: req.body.classTime !== undefined ? cleanText(req.body.classTime, 5) : req.user.classTime,
      onboardingDone: req.body.onboardingDone !== undefined ? Boolean(req.body.onboardingDone) : req.user.onboardingDone,
      shift: req.body.shift !== undefined ? cleanText(req.body.shift, 20) : req.user.shift,
      termStart: req.body.termStart !== undefined ? cleanText(req.body.termStart, 7) : req.user.termStart,
      termEnd: req.body.termEnd !== undefined ? cleanText(req.body.termEnd, 7) : req.user.termEnd,
      preferences: req.body.preferences !== undefined ? cleanPreferences(req.body.preferences, req.user.preferences) : req.user.preferences
    };
    if (!shifts.has(changes.shift)) return res.status(400).json({ error: 'Escolha um turno válido.' });
    if ((changes.termStart && !isMonth(changes.termStart)) || (changes.termEnd && !isMonth(changes.termEnd))) {
      return res.status(400).json({ error: 'Use meses válidos para o semestre letivo.' });
    }
    if (changes.termStart && changes.termEnd && changes.termStart > changes.termEnd) {
      return res.status(400).json({ error: 'O mês de início precisa vir antes do mês de fim.' });
    }
    return res.json(await updateUser(req.user.id, changes));
  } catch (error) {
    return next(error);
  }
});

app.get('/api/v1/subjects', requireAuth, async (req, res, next) => {
  try {
    return res.json(await listSubjects(req.user.id));
  } catch (error) {
    return next(error);
  }
});

app.post('/api/v1/subjects', requireAuth, async (req, res, next) => {
  try {
    const { subject, error } = subjectInput(req.body);
    if (error) return res.status(400).json({ error });
    return res.status(201).json(await addSubject(req.user.id, subject));
  } catch (error) {
    return next(error);
  }
});

app.put('/api/v1/subjects/order', requireAuth, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.filter(id => typeof id === 'string').slice(0, 60) : null;
    if (!ids) return res.status(400).json({ error: 'Envie a nova ordem das disciplinas.' });
    return res.json(await reorderSubjects(req.user.id, ids));
  } catch (error) {
    return next(error);
  }
});

app.put('/api/v1/subjects/:id', requireAuth, async (req, res, next) => {
  try {
    const { subject, error } = subjectInput(req.body);
    if (error) return res.status(400).json({ error });
    const updated = await updateSubject(req.user.id, req.params.id, subject);
    return updated ? res.json(updated) : res.status(404).json({ error: 'Disciplina não encontrada.' });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/v1/subjects/:id', requireAuth, async (req, res, next) => {
  try {
    await initEntities();
    const removed = await removeSubject(req.user.id, req.params.id);
    if (removed && !hasDatabase()) cascadeMemory('subjects', req.params.id);
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Disciplina não encontrada.' });
  } catch (error) {
    return next(error);
  }
});

registerEntityRoutes(app, requireAuth);
registerFileRoutes(app, requireAuth);

app.get('/api/v1/study-plans', requireAuth, async (req, res, next) => {
  try {
    return res.json(await listPlans(req.user.id));
  } catch (error) {
    return next(error);
  }
});

app.post('/api/v1/study-plans', requireAuth, async (req, res, next) => {
  try {
    const subject = cleanText(req.body.subject, 100);
    const topic = cleanText(req.body.topic, 180);
    const priority = cleanText(req.body.priority, 20);
    if (!subject || !topic) return res.status(400).json({ error: 'Disciplina e conteúdo são obrigatórios.' });
    if (!['Alta', 'Média', 'Baixa'].includes(priority)) {
      return res.status(400).json({ error: 'Escolha a prioridade do estudo.' });
    }
    const item = await addPlan(req.user.id, {
      subject,
      topic,
      date: cleanText(req.body.date, 20),
      time: cleanText(req.body.time, 10),
      priority,
      status: 'planejado'
    });
    return res.status(201).json(item);
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/v1/study-plans/:id', requireAuth, async (req, res, next) => {
  try {
    const removed = await removePlan(req.user.id, req.params.id);
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Planejamento não encontrado.' });
  } catch (error) {
    return next(error);
  }
});

app.get('/api/v1/diaries', requireAuth, async (req, res, next) => {
  try {
    return res.json(await listDiaries(req.user.id));
  } catch (error) {
    return next(error);
  }
});

app.put('/api/v1/diaries', requireAuth, async (req, res, next) => {
  try {
    const subject = cleanText(req.body.subject, 100);
    const date = cleanText(req.body.date, 20);
    if (!subject || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Disciplina e data válida são obrigatórias.' });
    }
    const entry = await saveDiary(req.user.id, {
      subject,
      date,
      planned: cleanMultiline(req.body.planned, 1000),
      actual: cleanMultiline(req.body.actual, 4000),
      reached: cleanMultiline(req.body.reached, 1500),
      understood: cleanMultiline(req.body.understood, 4000),
      doubts: cleanMultiline(req.body.doubts, 4000),
      notes: cleanMultiline(req.body.notes, 4000),
      references: cleanMultiline(req.body.references, 2000)
    });
    return res.json(entry);
  } catch (error) {
    return next(error);
  }
});

registerAiRoutes(app, requireAuth, aiRateLimit);

app.get('/api/v1/integrations/spotify/status', (_req, res) =>
  res.json({
    configured: spotifyConfigured(),
    clientId: process.env.SPOTIFY_CLIENT_ID || null,
    embedAvailable: true,
    premiumPlaybackAvailable: Boolean(process.env.SPOTIFY_CLIENT_ID),
    message: spotifyConfigured()
      ? 'OAuth e player Premium disponíveis.'
      : 'O embed está disponível; configure o Client ID para habilitar o player Premium.'
  })
);

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swagger, { customSiteTitle: 'Diário de Aula API' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  return res.status(500).json({ error: 'Ocorreu um erro inesperado. Tente novamente.' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(process.env.PORT || 3333, () => console.log('API em http://localhost:3333'));
}

export default app;
