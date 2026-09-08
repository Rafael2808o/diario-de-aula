import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || true }));
app.use(express.json({ limit: '120kb' }));

let studyPlans = [{ id: 'p1', subject: 'Teorias da Comunicação', topic: 'Semiótica e cultura de massa', date: '2026-09-10', time: '18:30', priority: 'Alta', status: 'planejado' }];
const subjects = [
  { id: 'direcao', name: 'Direção de Arte', progress: 80, color: '#6d8ffc' }, { id: 'teorias', name: 'Teorias da Comunicação', progress: 68, color: '#a779f5' },
  { id: 'tipografia', name: 'Tipografia', progress: 74, color: '#ee8f70' }, { id: 'redacao', name: 'Redação Publicitária', progress: 56, color: '#df6f9a' },
  { id: 'planejamento', name: 'Planejamento', progress: 62, color: '#48a99c' }, { id: 'fotografia', name: 'Fotografia', progress: 85, color: '#6a91a5' }
];
const materials = [
  { id: 'm1', title: 'Slides — Direção de Arte', type: 'Slides', subject: 'Direção de Arte', lesson: 'Aula 04' }, { id: 'm2', title: 'Teorias da Comunicação: resumo', type: 'PDF', subject: 'Teorias da Comunicação', lesson: 'Aula 03' },
  { id: 'm3', title: 'Branding e cultura digital', type: 'Artigo', subject: 'Planejamento', lesson: 'Aula 02' }, { id: 'm4', title: 'O design das coisas', type: 'Livro', subject: 'Direção de Arte', lesson: 'Referência' }
];
const questionSchema = { type: 'OBJECT', properties: { title: { type: 'STRING' }, questions: { type: 'ARRAY', items: { type: 'OBJECT', properties: { question: { type: 'STRING' }, options: { type: 'ARRAY', items: { type: 'STRING' } }, correctIndex: { type: 'INTEGER' }, explanation: { type: 'STRING' }, difficulty: { type: 'STRING' } }, required: ['question', 'options', 'correctIndex', 'explanation', 'difficulty'] } } }, required: ['title', 'questions'] };
const cleanText = (value, max) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';
const spotifyConfigured = () => Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REDIRECT_URI);

const swagger = { openapi: '3.0.3', info: { title: 'Diário de Aula API', version: '1.1.0', description: 'API para planejamento, materiais e revisão acadêmica com IA.' }, servers: [{ url: '/api/v1' }], paths: {
  '/subjects': { get: { summary: 'Lista disciplinas', responses: { 200: { description: 'OK' } } } },
  '/materials': { get: { summary: 'Lista materiais', responses: { 200: { description: 'OK' } } } },
  '/recommendations': { get: { summary: 'Sugere o próximo foco de estudo', responses: { 200: { description: 'OK' } } } },
  '/study-plans': { get: { summary: 'Lista planejamento', responses: { 200: { description: 'OK' } } }, post: { summary: 'Cria item de estudo', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subject', 'topic'] } } } }, responses: { 201: { description: 'Criado' } } } },
  '/ai/status': { get: { summary: 'Informa se a IA está configurada', responses: { 200: { description: 'OK' } } } },
  '/ai/questions': { post: { summary: 'Gera questões originais de revisão com Gemini', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subject', 'topic'] } } } }, responses: { 200: { description: 'Questões geradas' }, 503: { description: 'IA não configurada' } } } },
  '/integrations/spotify/status': { get: { summary: 'Consulta configuração da integração Spotify', responses: { 200: { description: 'OK' } } } },
  '/integrations/spotify/authorize': { get: { summary: 'Inicia autorização OAuth do Spotify', responses: { 302: { description: 'Redirecionamento para Spotify' } } } }
} };

app.get('/health/ready', (_, res) => res.json({ status: 'ready' }));
app.get('/api/v1/subjects', (_, res) => res.json(subjects));
app.get('/api/v1/materials', (_, res) => res.json(materials));
app.get('/api/v1/study-plans', (_, res) => res.json(studyPlans));
app.get('/api/v1/recommendations', (_, res) => res.json({ headline: 'Revise Semiótica antes da próxima avaliação', reason: 'Você marcou este conteúdo como uma dúvida e possui uma avaliação próxima.', estimatedMinutes: 35, nextAction: 'Gerar questões de revisão' }));
app.post('/api/v1/study-plans', (req, res) => {
  const subject = cleanText(req.body.subject, 100); const topic = cleanText(req.body.topic, 180);
  if (!subject || !topic) return res.status(400).json({ error: 'Disciplina e conteúdo são obrigatórios.' });
  const item = { id: crypto.randomUUID(), subject, topic, date: cleanText(req.body.date, 20), time: cleanText(req.body.time, 10), priority: cleanText(req.body.priority, 20) || 'Média', status: 'planejado' };
  studyPlans = [item, ...studyPlans]; return res.status(201).json(item);
});
app.get('/api/v1/ai/status', (_, res) => res.json({ provider: process.env.AI_PROVIDER || 'gemini', model: process.env.GEMINI_MODEL || 'gemini-flash-latest', configured: Boolean(process.env.GEMINI_API_KEY) }));
app.post('/api/v1/ai/questions', async (req, res) => {
  const subject = cleanText(req.body.subject, 100); const topic = cleanText(req.body.topic, 180); const context = cleanText(req.body.context, 3000); const quantity = Math.max(1, Math.min(10, Number.parseInt(req.body.quantity, 10) || 5));
  if (!subject || !topic) return res.status(400).json({ error: 'Disciplina e conteúdo são obrigatórios para gerar a revisão.' });
  if (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== 'gemini') return res.status(503).json({ error: 'O provedor de IA configurado ainda não é suportado.' });
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'A IA ainda não está configurada no servidor.' });
  const prompt = `Você é um educador brasileiro cuidadoso. Crie ${quantity} questões originais de múltipla escolha em português para revisão acadêmica. Disciplina: ${subject}. Tema: ${topic}. Contexto fornecido pelo estudante: ${context || 'não fornecido'}. Cada questão deve ter exatamente quatro alternativas, uma única correta, uma explicação curta e dificuldade entre Fácil, Média ou Avançada. Não reproduza enunciados protegidos nem invente fontes. Retorne somente o JSON no formato solicitado.`;
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(process.env.GEMINI_MODEL || 'gemini-flash-latest')}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
    const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json', responseSchema: questionSchema } }) });
    if (!response.ok) return res.status(502).json({ error: 'Não foi possível gerar a revisão agora. Tente novamente em alguns instantes.' });
    const payload = await response.json(); const text = payload?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || ''; const generated = JSON.parse(text);
    if (!Array.isArray(generated.questions) || !generated.questions.length) throw new Error('Resposta inválida');
    return res.json({ ...generated, source: 'gemini', generatedAt: new Date().toISOString() });
  } catch { return res.status(502).json({ error: 'A resposta da IA não pôde ser processada. Tente novamente.' }); }
});
app.get('/api/v1/integrations/spotify/status', (_, res) => res.json({ configured: spotifyConfigured(), provider: 'spotify' }));
app.get('/api/v1/integrations/spotify/authorize', (_, res) => {
  if (!spotifyConfigured()) return res.status(503).json({ error: 'A integração Spotify ainda não foi configurada.' });
  const params = new URLSearchParams({ response_type: 'code', client_id: process.env.SPOTIFY_CLIENT_ID, redirect_uri: process.env.SPOTIFY_REDIRECT_URI, scope: 'user-read-currently-playing user-read-playback-state user-modify-playback-state playlist-read-private', state: crypto.randomUUID() });
  return res.redirect(`https://accounts.spotify.com/authorize?${params}`);
});
app.get('/api/v1/integrations/spotify/callback', (req, res) => !req.query.code ? res.status(400).send('Autorização Spotify cancelada ou inválida.') : res.status(501).send('A autorização foi recebida. A persistência segura de contas será habilitada junto ao banco de dados.'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swagger, { customSiteTitle: 'Diário de Aula API' }));
if (process.argv[1] === fileURLToPath(import.meta.url)) app.listen(process.env.PORT || 3333, () => console.log('API em http://localhost:3333'));
export default app;
