import express from 'express';
import { randomUUID } from 'node:crypto';
import { initStore, memory, pool } from './store.js';

// Ferramentas de estudo com Gemini. A chave fica só no servidor e toda resposta é JSON validado aqui.
// Cada pedido vira um trabalho (ai_jobs): a rota responde na hora com o id, o servidor processa em segundo plano
// e o navegador consulta o resultado. Assim nenhuma requisição fica esperando a IA atrás de proxies com limite de tempo.
// O contexto chega rotulado com a origem ("[Aula de 11/10/2026: Tema]") para a IA citar de onde tirou cada ponto.

const models = () => [...new Set([process.env.GEMINI_MODEL || 'gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'])];
const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const list = (value, max = 20) => (Array.isArray(value) ? value.slice(0, max) : []);

export async function callGemini(parts, { maxOutputTokens = 2400, timeout = 45_000, temperature = 0.3 } = {}) {
  let lastError;
  for (const model of models()) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        signal: AbortSignal.timeout(timeout),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens, temperature } })
      });
      if (!response.ok) {
        console.warn(`[ai] ${model} respondeu HTTP ${response.status}.`);
        lastError = new Error(`Gemini respondeu ${response.status}`);
        continue;
      }
      const payload = await response.json();
      const raw = payload.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
      return { data: JSON.parse(raw), model };
    } catch (error) {
      console.warn(`[ai] ${model} falhou: ${error?.name || 'erro de comunicação'}.`);
      lastError = error;
    }
  }
  throw lastError || new Error('Não foi possível consultar a IA.');
}

const rules = `Regras obrigatórias:
- Use prioritariamente o MATERIAL DO ESTUDANTE abaixo. Cada trecho começa com a origem entre colchetes.
- Em "source", copie a origem exata (o texto entre colchetes) do trecho usado. Se o ponto não vier do material, use "Conhecimento geral".
- Nunca afirme o que o professor ensinou ou o que vai cair na prova sem que o material diga isso.
- Se o material for insuficiente para o pedido, diga isso em "gaps".
- Escreva em português do Brasil, com frases curtas e claras.`;

const depthText = {
  rapida: 'uma revisão rápida: no máximo 5 pontos, cada um com até 2 frases',
  completa: 'um resumo completo, organizado por tópicos, com até 10 pontos',
  essencial: 'apenas os conceitos e definições essenciais para memorizar, no máximo 8 itens curtos'
};

const withMaterial = (prompt, input) => `${prompt}\n\n${rules}\n\nMATERIAL DO ESTUDANTE:\n${input.context || '(nenhum registro enviado)'}`;
const cleanGaps = data => list(data?.gaps, 6).map(gap => text(gap, 300)).filter(Boolean);

function validQuestions(value, quantity) {
  return Boolean(
    value && typeof value.title === 'string' && Array.isArray(value.questions) && value.questions.length >= quantity &&
    value.questions.every(question =>
      typeof question.question === 'string' && Array.isArray(question.options) && question.options.length === 4 &&
      Number.isInteger(question.correctIndex) && question.correctIndex >= 0 && question.correctIndex < 4 && typeof question.explanation === 'string')
  );
}

// Cada ferramenta recebe a entrada já validada e devolve o resultado limpo (ou lança erro).
const tools = {
  async questions(input) {
    const level = ['Fácil', 'Média', 'Avançada'].includes(input.difficulty) ? `Todas com dificuldade ${input.difficulty}.` : 'Misture dificuldades Fácil, Média e Avançada.';
    const prompt = `Você é um educador brasileiro. Crie ${input.quantity} questões originais de múltipla escolha, em português, para revisar ${input.topic} na disciplina ${input.subject}. Use quatro alternativas plausíveis por questão, apenas uma correta, uma explicação didática e dificuldade Fácil, Média ou Avançada. ${level} Baseie as explicações no material do estudante quando ele trouxer a informação e não invente fatos fora dele.
Responda só com JSON neste formato: {"title":"Título da revisão","questions":[{"question":"Enunciado","options":["A","B","C","D"],"correctIndex":0,"explanation":"Explicação","difficulty":"Fácil"}]}. Use exatamente quatro opções e correctIndex entre 0 e 3.

MATERIAL DO ESTUDANTE:
${input.context || '(nenhum registro enviado)'}`;
    const { data, model } = await callGemini([{ text: prompt }], { temperature: 0.45 });
    if (!validQuestions(data, input.quantity)) throw new Error('Formato inválido');
    return { title: text(data.title, 160), questions: data.questions.slice(0, input.quantity), model, source: 'gemini' };
  },

  async resumo(input) {
    const depth = depthText[input.depth] ? input.depth : 'rapida';
    const { data, model } = await callGemini([{ text: withMaterial(`Faça ${depthText[depth]} sobre "${input.topic || 'as aulas registradas'}" na disciplina ${input.subject}.
Formato JSON: {"title":"...","points":[{"heading":"...","text":"...","source":"..."}],"gaps":["..."]}`, input) }]);
    const result = {
      title: text(data?.title, 160) || 'Resumo',
      points: list(data?.points, 12).map(point => ({ heading: text(point?.heading, 160), text: text(point?.text, 900), source: text(point?.source, 160) })).filter(point => point.text),
      gaps: cleanGaps(data)
    };
    if (!result.points.length) throw new Error('Resposta incompleta');
    return { ...result, model };
  },

  async flashcards(input) {
    const quantity = Math.max(3, Math.min(20, Number.parseInt(input.quantity, 10) || 8));
    const { data, model } = await callGemini([{ text: withMaterial(`Crie ${quantity} flashcards de pergunta e resposta para revisar "${input.topic || 'as aulas registradas'}" na disciplina ${input.subject}. Perguntas objetivas; respostas com até 3 frases.
Formato JSON: {"cards":[{"front":"pergunta","back":"resposta","source":"..."}],"gaps":["..."]}`, input) }]);
    const result = {
      cards: list(data?.cards, 20).map(card => ({ front: text(card?.front, 300), back: text(card?.back, 1200), source: text(card?.source, 160) })).filter(card => card.front && card.back),
      gaps: cleanGaps(data)
    };
    if (!result.cards.length) throw new Error('Resposta incompleta');
    return { ...result, model };
  },

  async explicar(input) {
    const level = input.level === 'resumida' ? 'em no máximo 4 frases' : input.level === 'detalhada' ? 'de forma detalhada, passo a passo' : 'de forma simples, em um parágrafo curto';
    const { data, model } = await callGemini([{ text: withMaterial(`O estudante não entendeu "${input.topic}" na disciplina ${input.subject}. Explique ${level}, como para quem está vendo pela primeira vez. Dê 2 exemplos práticos e 3 perguntas curtas para verificar a compreensão, com a resposta de cada uma.
Formato JSON: {"explanation":"...","examples":["..."],"check":[{"question":"...","answer":"..."}],"sources":["..."],"gaps":["..."]}`, input) }]);
    const result = {
      explanation: text(data?.explanation, 4000),
      examples: list(data?.examples, 4).map(example => text(example, 800)).filter(Boolean),
      check: list(data?.check, 5).map(item => ({ question: text(item?.question, 400), answer: text(item?.answer, 800) })).filter(item => item.question),
      sources: list(data?.sources, 8).map(source => text(source, 160)).filter(Boolean),
      gaps: cleanGaps(data)
    };
    if (!result.explanation) throw new Error('Resposta incompleta');
    return { ...result, model };
  },

  async transcribe(input) {
    const prompt = `Transcreva fielmente este áudio de uma aula${input.subject ? ` de ${input.subject}` : ''}, em português. Não invente nem complete frases: quando um trecho estiver incompreensível, escreva [trecho incerto]. Depois, a partir SOMENTE do que foi falado, organize um resumo.
Formato JSON: {"transcript":"...","summary":{"subject":"assunto principal","concepts":["..."],"examples":["..."],"guidance":["atividades e orientações"],"exam":["informações sobre provas"],"doubts":["dúvidas e pontos a revisar"]}}
Listas vazias quando o áudio não tratar do item.`;
    const { data, model } = await callGemini([{ text: prompt }, { inline_data: { mime_type: input.mime, data: input.data } }], { maxOutputTokens: 8000, timeout: 150_000, temperature: 0.1 });
    const summary = data?.summary || {};
    const clean = items => list(items, 15).map(item => text(item, 600)).filter(Boolean);
    const transcript = text(data?.transcript, 60_000);
    if (!transcript) throw new Error('Sem transcrição');
    return {
      transcript,
      summary: { subject: text(summary.subject, 200), concepts: clean(summary.concepts), examples: clean(summary.examples), guidance: clean(summary.guidance), exam: clean(summary.exam), doubts: clean(summary.doubts) },
      model
    };
  }
};

const failureMessage = {
  transcribe: 'Não foi possível transcrever este áudio agora. Tente um arquivo menor ou mais nítido.',
  default: 'A IA não respondeu agora. Nada foi inventado no lugar; tente de novo em instantes.'
};

// ---------- Fila de trabalhos ----------

// Pior caso: quatro modelos tentados em sequência na transcrição (150 s cada).
const jobLifetime = 11 * 60 * 1000;
let ready;
function initJobs() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS ai_jobs (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, payload TEXT, status TEXT NOT NULL DEFAULT 'pendente', result TEXT, error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS ai_jobs_user_idx ON ai_jobs(user_id);
      CREATE INDEX IF NOT EXISTS ai_jobs_created_idx ON ai_jobs(created_at)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

const memoryJobs = () => (memory.aiJobs ||= new Map());

async function saveJob(job) {
  await initJobs();
  if (pool) {
    await pool.query('INSERT INTO ai_jobs (id,user_id,kind,payload) VALUES ($1,$2,$3,$4)', [job.id, job.userId, job.kind, JSON.stringify(job.payload)]);
    return;
  }
  // Em memória, trabalhos com mais de um dia são descartados a cada novo pedido.
  const dayAgo = Date.now() - 86_400_000;
  for (const [id, item] of memoryJobs()) if (item.createdAt < dayAgo) memoryJobs().delete(id);
  memoryJobs().set(job.id, { ...job, status: 'pendente', createdAt: Date.now() });
}

// Reserva o trabalho de forma atômica: só quem muda "pendente" para "executando" processa, então nada roda duas vezes.
async function claimJob(id) {
  await initJobs();
  if (pool) {
    const row = (await pool.query("UPDATE ai_jobs SET status='executando', updated_at=NOW() WHERE id=$1 AND status='pendente' RETURNING kind, payload", [id])).rows[0];
    return row && { kind: row.kind, payload: JSON.parse(row.payload) };
  }
  const job = memoryJobs().get(id);
  if (!job || job.status !== 'pendente') return null;
  job.status = 'executando';
  return { kind: job.kind, payload: job.payload };
}

async function finishJob(id, { result = null, error = null }) {
  const status = error ? 'erro' : 'pronto';
  // O conteúdo enviado (inclusive o áudio de uma gravação) é apagado assim que o trabalho termina, com sucesso ou não.
  if (pool) await pool.query('UPDATE ai_jobs SET status=$2, result=$3, error=$4, payload=NULL, updated_at=NOW() WHERE id=$1', [id, status, result && JSON.stringify(result), error]);
  else Object.assign(memoryJobs().get(id) || {}, { status, result, error, payload: null });
}

// Consulta leve para o navegador: nunca lê o conteúdo enviado.
async function jobStatus(id, userId) {
  await initJobs();
  let job;
  if (pool) {
    job = (await pool.query('SELECT status, result, error, created_at AS "createdAt" FROM ai_jobs WHERE id=$1 AND user_id=$2', [id, userId])).rows[0];
    if (job) job = { ...job, result: job.result ? JSON.parse(job.result) : null, createdAt: new Date(job.createdAt).getTime() };
  } else {
    const item = memoryJobs().get(id);
    job = item && item.userId === userId ? item : null;
  }
  if (!job) return null;
  // Um trabalho interrompido (servidor reiniciado no meio) não fica pendente para sempre.
  if ((job.status === 'pendente' || job.status === 'executando') && Date.now() - job.createdAt > jobLifetime) {
    await finishJob(id, { error: failureMessage.default });
    return { status: 'erro', result: null, error: failureMessage.default };
  }
  return { status: job.status, result: job.result, error: job.error };
}

export async function runJob(id) {
  const job = await claimJob(id);
  if (!job) return;
  try {
    await finishJob(id, { result: await tools[job.kind](job.payload) });
  } catch (error) {
    console.warn(`[ai] trabalho ${job.kind} falhou: ${error?.message || error}`);
    await finishJob(id, { error: failureMessage[job.kind] || failureMessage.default });
  }
}

async function cleanupJobs() {
  if (pool) await pool.query("DELETE FROM ai_jobs WHERE created_at < NOW() - INTERVAL '1 day'");
}

async function enqueue(req, res, kind, payload) {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'A IA ainda não está configurada no servidor.' });
  const job = { id: randomUUID(), userId: req.user.id, kind, payload };
  try {
    await saveJob(job);
  } catch (error) {
    console.error(error);
    return res.status(502).json({ error: failureMessage.default });
  }
  // Processa depois de responder; a limpeza de trabalhos antigos também fica fora do caminho da requisição.
  setImmediate(() => {
    runJob(job.id).catch(error => console.error(error));
    cleanupJobs().catch(() => {});
  });
  return res.status(202).json({ jobId: job.id });
}

const audioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/m4a']);
// Gemini aceita estes formatos; m4a e o MP4 de áudio do iPhone seguem como AAC.
const geminiMime = mime => (['audio/mp4', 'audio/x-m4a', 'audio/m4a'].includes(mime) ? 'audio/aac' : mime === 'audio/mp3' ? 'audio/mpeg' : mime === 'audio/x-wav' ? 'audio/wav' : mime);

export function registerAiRoutes(app, requireAuth, aiRateLimit) {
  app.get('/api/v1/ai/status', (_req, res) =>
    res.json({ provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-flash-latest', configured: Boolean(process.env.GEMINI_API_KEY) })
  );

  app.post('/api/v1/ai/questions', requireAuth, aiRateLimit, async (req, res) => {
    const subject = text(req.body.subject, 100);
    const topic = text(req.body.topic, 180);
    if (!subject || !topic) return res.status(400).json({ error: 'Disciplina e conteúdo são obrigatórios.' });
    const quantity = Math.max(1, Math.min(10, Number.parseInt(req.body.quantity, 10) || 5));
    return enqueue(req, res, 'questions', { subject, topic, quantity, difficulty: text(req.body.difficulty, 20), context: text(req.body.context, 6000) });
  });

  app.post('/api/v1/ai/study', requireAuth, aiRateLimit, async (req, res) => {
    const kind = text(req.body.tool, 20);
    const subject = text(req.body.subject, 100);
    const topic = text(req.body.topic, 180);
    if (!['resumo', 'flashcards', 'explicar'].includes(kind)) return res.status(400).json({ error: 'Ferramenta desconhecida.' });
    if (!subject) return res.status(400).json({ error: 'Escolha a disciplina.' });
    if (kind === 'explicar' && !topic) return res.status(400).json({ error: 'Informe o que você não entendeu.' });
    const quantity = Math.max(3, Math.min(20, Number.parseInt(req.body.quantity, 10) || 8));
    return enqueue(req, res, kind, { subject, topic, depth: text(req.body.depth, 20), level: text(req.body.level, 20), quantity, context: text(req.body.context, 6000) });
  });

  // Áudio chega em base64 dentro do JSON (até 3 MB de arquivo, para caber no limite de corpo do proxy da Vercel).
  app.post('/api/v1/ai/transcribe', express.json({ limit: '4400kb' }), requireAuth, aiRateLimit, async (req, res) => {
    const mime = text(req.body.mime, 40).toLowerCase().split(';')[0];
    const data = typeof req.body.data === 'string' ? req.body.data : '';
    if (!req.body.consent) return res.status(400).json({ error: 'Confirme que a gravação foi autorizada.' });
    if (!audioTypes.has(mime)) return res.status(400).json({ error: 'Formato de áudio não suportado. Use MP3, M4A, WAV, OGG, AAC, FLAC ou WEBM.' });
    if (!data || data.length > 4_200_000) return res.status(413).json({ error: 'O áudio precisa ter até 3 MB.' });
    return enqueue(req, res, 'transcribe', { mime: geminiMime(mime), data, subject: text(req.body.subject, 100) });
  });

  app.get('/api/v1/ai/jobs/:id', requireAuth, async (req, res, next) => {
    try {
      const job = await jobStatus(req.params.id, req.user.id);
      return job ? res.json(job) : res.status(404).json({ error: 'Pedido não encontrado.' });
    } catch (error) {
      return next(error);
    }
  });
}
