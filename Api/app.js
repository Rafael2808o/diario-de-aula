import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  addPlan,
  createUser,
  hasDatabase,
  initStore,
  listDiaries,
  listPlans,
  loginUser,
  removePlan,
  saveDiary,
  updateUser,
  userFromToken
} from './store.js';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',').map(value => value.trim()) || true }));
app.use(express.json({ limit: '120kb' }));

const subjects = [
  { id: 'direcao', name: 'Direção de Arte', progress: 80, color: '#6d8ffc' },
  { id: 'teorias', name: 'Teorias da Comunicação', progress: 68, color: '#a779f5' },
  { id: 'tipografia', name: 'Tipografia', progress: 74, color: '#ee8f70' },
  { id: 'redacao', name: 'Redação Publicitária', progress: 56, color: '#df6f9a' },
  { id: 'planejamento', name: 'Planejamento', progress: 62, color: '#48a99c' },
  { id: 'fotografia', name: 'Fotografia', progress: 85, color: '#6a91a5' }
];

const materials = [
  { id: 'm1', title: 'Slides — Direção de Arte', type: 'Slides', subject: 'Direção de Arte', lesson: 'Aula 04' },
  { id: 'm2', title: 'Teorias da Comunicação: resumo', type: 'PDF', subject: 'Teorias da Comunicação', lesson: 'Aula 03' },
  { id: 'm3', title: 'Branding e cultura digital', type: 'Artigo', subject: 'Planejamento', lesson: 'Aula 02' },
  { id: 'm4', title: 'O design das coisas', type: 'Livro', subject: 'Direção de Arte', lesson: 'Referência' }
];

const questionSchema = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
          correctIndex: { type: 'INTEGER' },
          explanation: { type: 'STRING' },
          difficulty: { type: 'STRING' }
        },
        required: ['question', 'options', 'correctIndex', 'explanation', 'difficulty']
      }
    }
  },
  required: ['title', 'questions']
};

const cleanText = (value, max) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const cleanMultiline = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const spotifyConfigured = () =>
  Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REDIRECT_URI);

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

function fallbackQuestions(subject, topic, quantity) {
  const templates = [
    {
      question: `Qual é a melhor estratégia para revisar “${topic}” em ${subject}?`,
      options: ['Memorizar frases isoladas', 'Relacionar conceitos, exemplos e consequências', 'Pular o conteúdo mais difícil', 'Estudar apenas na véspera'],
      correctIndex: 1,
      explanation: 'Uma revisão ativa conecta conceito, contexto e aplicação — não apenas palavras-chave.',
      difficulty: 'Fácil'
    },
    {
      question: `Ao explicar ${topic} a outra pessoa, qual evidência demonstra compreensão real?`,
      options: ['Repetir o título da aula', 'Usar um exemplo e justificar a relação com o conceito', 'Listar nomes sem contexto', 'Afirmar que é intuitivo'],
      correctIndex: 1,
      explanation: 'Explicar com um exemplo e uma justificativa mostra que o conceito foi elaborado.',
      difficulty: 'Média'
    },
    {
      question: `Em uma situação nova, como você aplicaria os princípios de ${topic}?`,
      options: ['Ignorando o contexto', 'Identificando elementos do caso e comparando-os com a teoria', 'Escolhendo a primeira resposta possível', 'Usando apenas uma definição decorada'],
      correctIndex: 1,
      explanation: 'A transferência de conhecimento exige analisar o caso antes de aplicar a teoria.',
      difficulty: 'Avançada'
    },
    {
      question: `Qual registro torna sua próxima revisão de ${topic} mais eficiente?`,
      options: ['Somente a data da aula', 'Uma dúvida, um exemplo e uma conexão com outro conteúdo', 'Uma lista sem explicação', 'Nenhum registro'],
      correctIndex: 1,
      explanation: 'Registros conectados dão contexto para retomar o assunto e identificar lacunas.',
      difficulty: 'Média'
    }
  ];
  return {
    title: `Revisão guiada — ${topic}`,
    questions: Array.from({ length: quantity }, (_, index) => ({ ...templates[index % templates.length] }))
  };
}

function validQuestionSet(value) {
  return Boolean(
    value &&
    typeof value.title === 'string' &&
    Array.isArray(value.questions) &&
    value.questions.length > 0 &&
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
  const prompt = `Você é um educador brasileiro. Crie ${quantity} questões originais de múltipla escolha, em português, para revisar ${topic} na disciplina ${subject}. Use quatro alternativas plausíveis por questão, apenas uma correta, uma explicação didática e dificuldade Fácil, Média ou Avançada. Contexto fornecido pelo estudante: ${context || 'não informado'}. Evite perguntas genéricas e não invente fatos fora do contexto.`;
  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-3-flash-preview', 'gemini-3.6-flash', 'gemini-flash-latest'])];
  let lastError;

  for (const model of models) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        signal: AbortSignal.timeout(22_000),
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: questionSchema,
            temperature: 0.65
          }
        })
      }
    );

    if (!response.ok) {
      lastError = new Error(`Gemini respondeu ${response.status}`);
      continue;
    }

    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = text ? JSON.parse(text) : null;
    if (validQuestionSet(parsed)) {
      return { ...parsed, questions: parsed.questions.slice(0, quantity), model };
    }
    lastError = new Error('A IA retornou um formato inválido.');
  }

  throw lastError || new Error('Não foi possível consultar a IA.');
}

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
    }
  },
  paths: {
    '/auth/register': { post: { summary: 'Cria uma conta', responses: { 201: { description: 'Conta criada' } } } },
    '/auth/login': { post: { summary: 'Autentica uma conta', responses: { 200: { description: 'Autenticado' } } } },
    '/me': {
      get: { summary: 'Obtém o perfil', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      patch: { summary: 'Atualiza o perfil', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Atualizado' } } }
    },
    '/subjects': { get: { summary: 'Lista disciplinas', responses: { 200: { description: 'OK' } } } },
    '/materials': { get: { summary: 'Lista materiais', responses: { 200: { description: 'OK' } } } },
    '/study-plans': {
      get: { summary: 'Lista o planejamento', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      post: { summary: 'Cria item de estudo', security: [{ bearerAuth: [] }], responses: { 201: { description: 'Criado' } } }
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
      put: { summary: 'Cria ou atualiza um registro', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Salvo' } } }
    },
    '/ai/status': { get: { summary: 'Informa se a IA está configurada', responses: { 200: { description: 'OK' } } } },
    '/ai/questions': {
      post: { summary: 'Gera questões com Gemini', security: [{ bearerAuth: [] }], responses: { 200: { description: 'Questões geradas' } } }
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

app.get('/api/v1/subjects', (_req, res) => res.json(subjects));
app.get('/api/v1/materials', (_req, res) => res.json(materials));
app.get('/api/v1/recommendations', (_req, res) =>
  res.json({
    headline: 'Revise o que ficou menos claro na última aula',
    reason: 'Registros de dúvidas e avaliações próximas orientam a próxima sessão.',
    estimatedMinutes: 35,
    nextAction: 'Gerar questões de revisão'
  })
);

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
    model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
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
    const fallback = fallbackQuestions(subject, topic, quantity);
    return res.json({
      ...fallback,
      source: 'guided-fallback',
      notice: 'A IA ficou temporariamente indisponível; criamos uma revisão guiada para você não interromper o estudo.'
    });
  }
});

app.get('/api/v1/integrations/spotify/status', (_req, res) =>
  res.json({
    configured: spotifyConfigured(),
    embedAvailable: true,
    message: spotifyConfigured()
      ? 'OAuth disponível.'
      : 'Playlists incorporadas estão disponíveis sem conectar uma conta.'
  })
);

app.get('/api/v1/integrations/spotify/authorize', (_req, res) => {
  if (!spotifyConfigured()) {
    return res.status(503).json({ error: 'OAuth do Spotify ainda não foi configurado. Use a playlist incorporada sem login.' });
  }
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: 'user-read-private playlist-read-private user-read-playback-state',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state: randomUUID()
  });
  return res.redirect(`https://accounts.spotify.com/authorize?${query}`);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swagger, { customSiteTitle: 'Diário de Aula API' }));
app.use((error, _req, res, _next) => {
  console.error(error);
  return res.status(500).json({ error: 'Ocorreu um erro inesperado. Tente novamente.' });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(process.env.PORT || 3333, () => console.log('API em http://localhost:3333'));
}

export default app;
