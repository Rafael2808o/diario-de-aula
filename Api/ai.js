import express from 'express';

// Ferramentas de estudo com Gemini. Toda resposta é JSON validado aqui no servidor; a chave nunca vai ao navegador.
// O contexto chega rotulado com a origem ("[Aula de 11/10/2026 · Tema]") para a IA citar de onde tirou cada ponto.

const models = () => [...new Set([
  process.env.GEMINI_MODEL || 'gemini-flash-latest',
  'gemini-flash-lite-latest'
])];

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const list = (value, max = 20) => (Array.isArray(value) ? value.slice(0, max) : []);

async function callGemini(parts, { maxOutputTokens = 2400, timeout = 25_000, temperature = 0.3 } = {}) {
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

const tools = {
  resumo(body) {
    const depth = depthText[body.depth] ? body.depth : 'rapida';
    return {
      prompt: `Faça ${depthText[depth]} sobre "${body.topic || 'as aulas registradas'}" na disciplina ${body.subject}.
Formato JSON: {"title":"...","points":[{"heading":"...","text":"...","source":"..."}],"gaps":["..."]}`,
      clean: data => ({
        title: text(data.title, 160) || 'Resumo',
        points: list(data.points, 12).map(point => ({ heading: text(point?.heading, 160), text: text(point?.text, 900), source: text(point?.source, 160) })).filter(point => point.text),
        gaps: list(data.gaps, 6).map(gap => text(gap, 300)).filter(Boolean)
      }),
      valid: data => data.points.length > 0
    };
  },
  flashcards(body) {
    const quantity = Math.max(3, Math.min(20, Number.parseInt(body.quantity, 10) || 8));
    return {
      prompt: `Crie ${quantity} flashcards de pergunta e resposta para revisar "${body.topic || 'as aulas registradas'}" na disciplina ${body.subject}. Perguntas objetivas; respostas com até 3 frases.
Formato JSON: {"cards":[{"front":"pergunta","back":"resposta","source":"..."}],"gaps":["..."]}`,
      clean: data => ({
        cards: list(data.cards, 20).map(card => ({ front: text(card?.front, 300), back: text(card?.back, 1200), source: text(card?.source, 160) })).filter(card => card.front && card.back),
        gaps: list(data.gaps, 6).map(gap => text(gap, 300)).filter(Boolean)
      }),
      valid: data => data.cards.length > 0
    };
  },
  explicar(body) {
    const level = body.level === 'resumida' ? 'em no máximo 4 frases' : body.level === 'detalhada' ? 'de forma detalhada, passo a passo' : 'de forma simples, em um parágrafo curto';
    return {
      prompt: `O estudante não entendeu "${body.topic}" na disciplina ${body.subject}. Explique ${level}, como para quem está vendo pela primeira vez. Dê 2 exemplos práticos e 3 perguntas curtas para verificar a compreensão, com a resposta de cada uma.
Formato JSON: {"explanation":"...","examples":["..."],"check":[{"question":"...","answer":"..."}],"sources":["..."],"gaps":["..."]}`,
      clean: data => ({
        explanation: text(data.explanation, 4000),
        examples: list(data.examples, 4).map(example => text(example, 800)).filter(Boolean),
        check: list(data.check, 5).map(item => ({ question: text(item?.question, 400), answer: text(item?.answer, 800) })).filter(item => item.question),
        sources: list(data.sources, 8).map(source => text(source, 160)).filter(Boolean),
        gaps: list(data.gaps, 6).map(gap => text(gap, 300)).filter(Boolean)
      }),
      valid: data => Boolean(data.explanation)
    };
  }
};

const audioTypes = new Set(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/flac', 'audio/webm', 'audio/mp4', 'audio/x-m4a', 'audio/m4a']);
// Gemini aceita estes formatos; m4a e o MP4 de áudio do iPhone seguem como AAC.
const geminiMime = mime => (['audio/mp4', 'audio/x-m4a', 'audio/m4a'].includes(mime) ? 'audio/aac' : mime === 'audio/mp3' ? 'audio/mpeg' : mime === 'audio/x-wav' ? 'audio/wav' : mime);

export function registerAiRoutes(app, requireAuth, aiRateLimit) {
  app.post('/api/v1/ai/study', requireAuth, aiRateLimit, async (req, res) => {
    const tool = tools[req.body.tool];
    const subject = text(req.body.subject, 100);
    const topic = text(req.body.topic, 180);
    const context = text(req.body.context, 6000);
    if (!tool) return res.status(400).json({ error: 'Ferramenta desconhecida.' });
    if (!subject) return res.status(400).json({ error: 'Escolha a disciplina.' });
    if (req.body.tool === 'explicar' && !topic) return res.status(400).json({ error: 'Informe o que você não entendeu.' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'A IA ainda não está configurada no servidor.' });
    const spec = tool({ ...req.body, subject, topic });
    try {
      const { data, model } = await callGemini([{ text: `${spec.prompt}\n\n${rules}\n\nMATERIAL DO ESTUDANTE:\n${context || '(nenhum registro enviado)'}` }]);
      const result = spec.clean(data || {});
      if (!spec.valid(result)) throw new Error('Resposta incompleta');
      return res.json({ ...result, model, source: 'gemini' });
    } catch (_error) {
      return res.status(502).json({ error: 'A IA não respondeu agora. Nada foi inventado no lugar; tente de novo em instantes.' });
    }
  });

  // Áudio chega em base64 dentro do JSON (até 3 MB de arquivo, abaixo do limite do proxy da Vercel), por isso o limite maior só nesta rota.
  app.post('/api/v1/ai/transcribe', express.json({ limit: '4400kb' }), requireAuth, aiRateLimit, async (req, res) => {
    const mime = text(req.body.mime, 40).toLowerCase().split(';')[0];
    const data = typeof req.body.data === 'string' ? req.body.data : '';
    if (!req.body.consent) return res.status(400).json({ error: 'Confirme que a gravação foi autorizada.' });
    if (!audioTypes.has(mime)) return res.status(400).json({ error: 'Formato de áudio não suportado. Use MP3, M4A, WAV, OGG, AAC, FLAC ou WEBM.' });
    if (!data || data.length > 4_200_000) return res.status(413).json({ error: 'O áudio precisa ter até 3 MB.' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'A transcrição ainda não está configurada no servidor.' });
    const subject = text(req.body.subject, 100);
    const prompt = `Transcreva fielmente este áudio de uma aula${subject ? ` de ${subject}` : ''}, em português. Não invente nem complete frases: quando um trecho estiver incompreensível, escreva [trecho incerto]. Depois, a partir SOMENTE do que foi falado, organize um resumo.
Formato JSON: {"transcript":"...","summary":{"subject":"assunto principal","concepts":["..."],"examples":["..."],"guidance":["atividades e orientações"],"exam":["informações sobre provas"],"doubts":["dúvidas e pontos a revisar"]}}
Listas vazias quando o áudio não tratar do item.`;
    try {
      const { data: result, model } = await callGemini([{ text: prompt }, { inline_data: { mime_type: geminiMime(mime), data } }], { maxOutputTokens: 8000, timeout: 90_000, temperature: 0.1 });
      const summary = result?.summary || {};
      const clean = items => list(items, 15).map(item => text(item, 600)).filter(Boolean);
      const transcript = text(result?.transcript, 60_000);
      if (!transcript) throw new Error('Sem transcrição');
      return res.json({
        transcript,
        summary: { subject: text(summary.subject, 200), concepts: clean(summary.concepts), examples: clean(summary.examples), guidance: clean(summary.guidance), exam: clean(summary.exam), doubts: clean(summary.doubts) },
        model
      });
    } catch (_error) {
      return res.status(502).json({ error: 'Não foi possível transcrever este áudio agora. Tente um arquivo menor ou mais nítido.' });
    }
  });
}
