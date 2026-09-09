import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'node:url';
import {
  addMaterial,
  addPlan,
  createUser,
  hasDatabase,
  initStore,
  listDiaries,
  listMaterials,
  listPlans,
  loginUser,
  removePlan,
  removeMaterial,
  saveDiary,
  updateUser,
  userFromToken
} from './store.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',').map(value => value.trim()) || true }));
app.use(express.json({ limit: '120kb' }));

const materialTypes = new Set(['Link', 'PDF', 'Slides', 'Artigo', 'Livro', 'Anotação']);

const cleanText = (value, max) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const cleanMultiline = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const spotifyConfigured = () => Boolean(process.env.SPOTIFY_CLIENT_ID);

async function requireAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const user = await userFromToken(token);
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

function validQuestionSet(value, quantity) {
  return Boolean(
    value &&
    typeof value.title === 'string' &&
    Array.isArray(value.questions) &&
    value.questions.length >= quantity &&
    value.questions.every(question =>
      typeof question.question === 'string' &&
      Array.isArray(question.options) &&
      question.options.length === 4 &&
      Number.isInteger(question.correctIndex) &&
      question.correctIndex >= 0 &&
      question.correctIndex < 4 &&
      typeof question.explanation === 'string'
    )
  );
}

async function generateWithGemini({ subject, topic, context, quantity }) {
  const prompt = `Você é um educador brasileiro. Crie ${quantity} questões originais de múltipla escolha, em português, para revisar ${topic} na disciplina ${subject}. Use quatro alternativas plausíveis por questão, apenas uma correta, uma explicação didática e dificuldade Fácil, Média ou Avançada. Contexto fornecido pelo estudante: ${context || 'não informado'}. Evite perguntas genéricas e não invente fatos fora do contexto. Responda exclusivamente como JSON válido neste formato exato: {"title":"Título da revisão","questions":[{"question":"Enunciado","options":["Alternativa A","Alternativa B","Alternativa C","Alternativa D"],"correctIndex":0,"explanation":"Explicação didática","difficulty":"Fácil"}]}. Use exatamente quatro opções e correctIndex entre 0 e 3.`;
  const models = [...new Set([
    process.env.GEMINI_MODEL || 'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.6-flash'
  ])];
  let lastError;

  for (const model of models) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          signal: AbortSignal.timeout(model === models[0] ? 10_000 : 20_000),
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              maxOutputTokens: 2400,
              thinkingConfig: { thinkingBudget: 0 },
              temperature: 0.45
            }
          })
        }
      );

      if (!response.ok) {
        console.warn(`[ai] ${model} respondeu HTTP ${response.status}.`);
        lastError = new Error(`Gemini respondeu ${response.status}`);
        continue;
      }

      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      const parsed = text ? JSON.parse(text) : null;
      if (validQuestionSet(parsed, quantity)) {
        return { ...parsed, questions: parsed.questions.slice(0, quantity), model };
      }
      console.warn(`[ai] ${model} retornou um conjunto de questões inválido.`);
      lastError = new Error('A IA retornou um formato inválido.');
    } catch (error) {
      console.warn(`[ai] ${model} falhou: ${error?.name || 'erro de comunicação'}.`);
      lastError = error;
    }
  }

  throw lastError || new Error('Não foi possível consultar a IA.');
}

const requestBody = schema => ({
  required: true,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } }
});
const jsonResponse = (description, schema) => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${schema}` } } }
});

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
          semester: { type: 'string' }
        }
      },
      RegisterInput: {
        type: 'object', required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', example: 'Ana Souza' },
          email: { type: 'string', format: 'email', example: 'ana@exemplo.com' },
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
        type: 'object', required: ['subject', 'topic'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true }, subject: { type: 'string' }, topic: { type: 'string' },
          date: { type: 'string', format: 'date' }, time: { type: 'string', example: '19:30' }, priority: { type: 'string', enum: ['Alta', 'Média', 'Baixa'] }
        }
      },
      Material: {
        type: 'object', required: ['title'],
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true }, title: { type: 'string' },
          type: { type: 'string', enum: [...materialTypes] }, subject: { type: 'string' },
          url: { type: 'string', format: 'uri' }, notes: { type: 'string' }
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
      Error: { type: 'object', properties: { error: { type: 'string' } } }
    }
  },
  paths: {
    '/openapi.json': { get: { summary: 'Contrato OpenAPI em JSON', responses: { 200: { description: 'Documento OpenAPI' } } } },
    '/auth/register': { post: { summary: 'Cria uma conta', requestBody: requestBody('RegisterInput'), responses: { 201: jsonResponse('Conta criada', 'Session'), 409: jsonResponse('E-mail já cadastrado', 'Error') } } },
    '/auth/login': { post: { summary: 'Autentica uma conta', requestBody: requestBody('LoginInput'), responses: { 200: jsonResponse('Autenticado', 'Session'), 401: jsonResponse('Credenciais inválidas', 'Error') } } },
    '/me': {
      get: { summary: 'Obtém o perfil', security: [{ bearerAuth: [] }], responses: { 200: jsonResponse('Perfil', 'User') } },
      patch: { summary: 'Atualiza o perfil', security: [{ bearerAuth: [] }], requestBody: requestBody('User'), responses: { 200: jsonResponse('Atualizado', 'User') } }
    },
    '/materials': {
      get: { summary: 'Lista materiais da conta', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      post: { summary: 'Adiciona material à biblioteca', security: [{ bearerAuth: [] }], requestBody: requestBody('Material'), responses: { 201: jsonResponse('Criado', 'Material') } }
    },
    '/materials/{id}': {
      delete: { summary: 'Remove material da biblioteca', security: [{ bearerAuth: [] }], parameters: [{ in: 'path', name: 'id', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Removido' } } }
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
    '/ai/status': { get: { summary: 'Informa se a IA está configurada', responses: { 200: { description: 'OK' } } } },
    '/ai/questions': {
      post: { summary: 'Gera questões com Gemini', security: [{ bearerAuth: [] }], requestBody: requestBody('QuestionRequest'), responses: { 200: { description: 'Questões geradas' }, 429: jsonResponse('Limite temporário atingido', 'Error') } }
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

app.get('/api/v1/me', requireAuth, (req, res) => res.json(req.user));
app.patch('/api/v1/me', requireAuth, async (req, res, next) => {
  try {
    const user = await updateUser(req.user.id, {
      name: cleanText(req.body.name, 80) || req.user.name,
      course: cleanText(req.body.course, 100),
      institution: cleanText(req.body.institution, 100),
      semester: cleanText(req.body.semester, 40)
    });
    return res.json(user);
  } catch (error) {
    return next(error);
  }
});

app.get('/api/v1/materials', requireAuth, async (req, res, next) => {
  try {
    return res.json(await listMaterials(req.user.id));
  } catch (error) {
    return next(error);
  }
});

app.post('/api/v1/materials', requireAuth, async (req, res, next) => {
  try {
    const title = cleanText(req.body.title, 180);
    const type = cleanText(req.body.type, 30) || 'Link';
    const url = cleanText(req.body.url, 1000);
    if (!title) return res.status(400).json({ error: 'Informe um título para o material.' });
    if (!materialTypes.has(type)) return res.status(400).json({ error: 'Selecione um tipo de material válido.' });
    if (url && !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'O link precisa começar com http:// ou https://.' });
    const material = await addMaterial(req.user.id, {
      title,
      type,
      subject: cleanText(req.body.subject, 100),
      url,
      notes: cleanMultiline(req.body.notes, 2000)
    });
    return res.status(201).json(material);
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/v1/materials/:id', requireAuth, async (req, res, next) => {
  try {
    const removed = await removeMaterial(req.user.id, req.params.id);
    return removed ? res.status(204).end() : res.status(404).json({ error: 'Material não encontrado.' });
  } catch (error) {
    return next(error);
  }
});

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
    if (!subject || !topic) return res.status(400).json({ error: 'Disciplina e conteúdo são obrigatórios.' });
    const item = await addPlan(req.user.id, {
      subject,
      topic,
      date: cleanText(req.body.date, 20),
      time: cleanText(req.body.time, 10),
      priority: cleanText(req.body.priority, 20) || 'Média',
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

app.get('/api/v1/ai/status', (_req, res) =>
  res.json({
    provider: 'gemini',
    model: process.env.GEMINI_MODEL || 'gemini-flash-latest',
    configured: Boolean(process.env.GEMINI_API_KEY)
  })
);

app.post('/api/v1/ai/questions', requireAuth, aiRateLimit, async (req, res) => {
  const subject = cleanText(req.body.subject, 100);
  const topic = cleanText(req.body.topic, 180);
  const context = cleanMultiline(req.body.context, 3000);
  const quantity = Math.max(1, Math.min(10, Number.parseInt(req.body.quantity, 10) || 5));
  if (!subject || !topic) return res.status(400).json({ error: 'Disciplina e conteúdo são obrigatórios.' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'A IA ainda não está configurada no servidor.' });

  try {
    const generated = await generateWithGemini({ subject, topic, context, quantity });
    return res.json({ ...generated, source: 'gemini' });
  } catch (_error) {
    return res.status(502).json({
      error: 'A IA não conseguiu gerar questões agora. Nenhuma questão genérica foi usada; tente novamente em instantes.'
    });
  }
});

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
