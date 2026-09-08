import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGINS?.split(',') || true }));
app.use(express.json());

let studyPlans = [
  { id: 'p1', subject: 'Teorias da Comunicação', topic: 'Semiótica e cultura de massa', date: '2026-09-10', time: '18:30', priority: 'Alta', status: 'planejado' }
];
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
const swagger = {
  openapi: '3.0.3', info: { title: 'Diário de Aula API', version: '1.0.0', description: 'API da memória acadêmica.' },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/subjects': { get: { summary: 'Lista disciplinas', responses: { 200: { description: 'OK' } } } },
    '/materials': { get: { summary: 'Lista materiais', responses: { 200: { description: 'OK' } } } },
    '/study-plans': { get: { summary: 'Lista planejamento', responses: { 200: { description: 'OK' } } }, post: { summary: 'Cria item de estudo', requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['subject', 'topic'], properties: { subject: { type: 'string' }, topic: { type: 'string' }, date: { type: 'string' }, time: { type: 'string' }, priority: { type: 'string' } } } } } }, responses: { 201: { description: 'Criado' } } } }
  }
};
app.get('/health/ready', (_, res) => res.json({ status: 'ready' }));
app.get('/api/v1/subjects', (_, res) => res.json(subjects));
app.get('/api/v1/materials', (_, res) => res.json(materials));
app.get('/api/v1/study-plans', (_, res) => res.json(studyPlans));
app.post('/api/v1/study-plans', (req, res) => {
  const { subject, topic, date, time, priority = 'Média', status = 'planejado' } = req.body;
  if (!subject || !topic) return res.status(400).json({ error: 'Disciplina e conteúdo são obrigatórios.' });
  const item = { id: crypto.randomUUID(), subject, topic, date, time, priority, status };
  studyPlans = [item, ...studyPlans]; res.status(201).json(item);
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swagger, { customSiteTitle: 'Diário de Aula API' }));
if (process.argv[1] === fileURLToPath(import.meta.url)) app.listen(process.env.PORT || 3333, () => console.log('API em http://localhost:3333'));
export default app;
