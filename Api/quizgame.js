import { randomInt, randomUUID } from 'node:crypto';
import { generateQuestions } from './ai.js';
import { notify } from './notifications.js';
import { publicName } from './social.js';
import { initStore, memory, pool } from './store.js';
import { awardXp } from './xp.js';

// Perguntados (versão 4.0): competição de perguntas entre amigos.
// - Quem cria escolhe a disciplina e o conteúdo; as perguntas são geradas pela IA no servidor a partir do material
//   de quem criou (nível Média/Avançada). O gabarito nunca vai para o navegador antes da resposta.
// - Cada pessoa joga no próprio ritmo (até 48 h), as mesmas perguntas na mesma ordem. O tempo de cada resposta é
//   medido no servidor (do momento em que a pergunta foi entregue até a resposta). Recarregar não zera o relógio.
// - Pontos: acerto = 100 + até 50 pela rapidez; erro = -25; sem resposta no tempo = 0.
//   Vence quem fizer mais pontos; empate: menos tempo total.
// - Equilíbrio com o ranking geral: vitória +30 XP e participação +10 XP, só com 2 ou mais pessoas que terminaram
//   e no máximo 3 partidas com XP por dia para cada pessoa. O ranking do jogo é separado e usa os pontos.

export const secondsPerQuestion = 25;
const graceMs = 1500;
const matchLifetimeMs = 48 * 3600_000;
const xpMatchesPerDay = 3;
const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const saoPauloDay = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);

let generator = generateQuestions;
// Só para os testes automáticos (sem chamar a IA de verdade).
export const setQuestionGenerator = fn => { generator = fn || generateQuestions; };
const aiReady = () => generator !== generateQuestions || Boolean(process.env.GEMINI_API_KEY);

let ready;
export function initQuizGame() {
  ready ||= (async () => {
    await initStore();
    if (!pool) {
      memory.quizMatches ||= [];
      memory.quizPlayers ||= [];
      memory.quizAnswers ||= [];
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quiz_matches (
        id TEXT PRIMARY KEY, owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        subject_name TEXT NOT NULL, topic TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'gerando',
        questions TEXT, error TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), ends_at TIMESTAMPTZ, finished_at TIMESTAMPTZ);
      CREATE TABLE IF NOT EXISTS quiz_players (
        match_id TEXT NOT NULL REFERENCES quiz_matches(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        current_index INTEGER NOT NULL DEFAULT 0, served_at TIMESTAMPTZ,
        score INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, wrong INTEGER NOT NULL DEFAULT 0,
        total_ms INTEGER NOT NULL DEFAULT 0, finished_at TIMESTAMPTZ, declined BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (match_id, user_id));
      CREATE INDEX IF NOT EXISTS quiz_players_user_idx ON quiz_players(user_id);
      CREATE TABLE IF NOT EXISTS quiz_answers (
        match_id TEXT NOT NULL REFERENCES quiz_matches(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL, choice INTEGER, correct BOOLEAN NOT NULL, ms INTEGER NOT NULL, points INTEGER NOT NULL,
        PRIMARY KEY (match_id, user_id, idx));`);
  })();
  return ready;
}

const memoryUser = id => memory.users.find(user => user.id === id) || {};

// Embaralha as alternativas para a correta não cair sempre na mesma posição.
function prepare(questions) {
  return questions.map(question => {
    const order = [0, 1, 2, 3];
    for (let i = 3; i > 0; i -= 1) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    return {
      question: oneLine(question.question, 600),
      options: order.map(index => oneLine(question.options[index], 300)),
      correctIndex: order.indexOf(question.correctIndex),
      explanation: String(question.explanation || '').trim().slice(0, 1200),
      difficulty: oneLine(question.difficulty, 20)
    };
  });
}

async function matchRow(id) {
  const row = pool
    ? (await pool.query(`SELECT id, owner_id AS "ownerId", subject_name AS "subjectName", topic, status, questions, error, created_at AS "createdAt", ends_at AS "endsAt", finished_at AS "finishedAt" FROM quiz_matches WHERE id=$1`, [id])).rows[0]
    : memory.quizMatches.find(item => item.id === id);
  if (!row) return null;
  return { ...row, questions: typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions || [] };
}

async function playersOf(matchId) {
  if (pool) {
    return (await pool.query(`SELECT p.user_id AS "userId", p.current_index AS "currentIndex", p.served_at AS "servedAt", p.score, p.correct, p.wrong, p.total_ms AS "totalMs",
      p.finished_at AS "finishedAt", p.declined, u.name, u.avatar_version AS "avatarVersion" FROM quiz_players p JOIN users u ON u.id=p.user_id WHERE p.match_id=$1`, [matchId])).rows;
  }
  return memory.quizPlayers.filter(item => item.matchId === matchId).map(item => ({ ...item, name: memoryUser(item.userId).name, avatarVersion: memoryUser(item.userId).avatar_version }));
}

async function updatePlayer(matchId, userId, fields) {
  if (pool) {
    const columns = { currentIndex: 'current_index', servedAt: 'served_at', score: 'score', correct: 'correct', wrong: 'wrong', totalMs: 'total_ms', finishedAt: 'finished_at', declined: 'declined' };
    const keys = Object.keys(fields);
    await pool.query(`UPDATE quiz_players SET ${keys.map((key, index) => `${columns[key]}=$${index + 3}`).join(', ')} WHERE match_id=$1 AND user_id=$2`, [matchId, userId, ...keys.map(key => fields[key])]);
  } else Object.assign(memory.quizPlayers.find(item => item.matchId === matchId && item.userId === userId), fields);
}

const ranked = players => players.filter(player => player.finishedAt).sort((a, b) => b.score - a.score || a.totalMs - b.totalMs);

// Encerra quando todos os que aceitaram terminaram ou quando o prazo acaba; dá o XP uma vez só.
async function settle(match, players, now = Date.now()) {
  if (match.status !== 'aberta') return match;
  const active = players.filter(player => !player.declined);
  const allDone = active.length > 0 && active.every(player => player.finishedAt);
  const expired = match.endsAt && now > new Date(match.endsAt).getTime();
  if (!allDone && !expired) return match;
  const finishedAt = new Date(now);
  if (pool) {
    const closed = await pool.query(`UPDATE quiz_matches SET status='encerrada', finished_at=$2 WHERE id=$1 AND status='aberta' RETURNING id`, [match.id, finishedAt]);
    if (!closed.rowCount) return { ...match, status: 'encerrada' };
  } else Object.assign(memory.quizMatches.find(item => item.id === match.id), { status: 'encerrada', finishedAt });
  const podium = ranked(active);
  if (podium.length >= 2) {
    for (const [position, player] of podium.entries()) {
      if (!(await underDailyCap(player.userId, now))) continue;
      const winner = position === 0;
      await awardXp(player.userId, winner ? 'perguntados-vitoria' : 'perguntados-partida', match.id, { text: winner ? `Venceu no Perguntados: ${match.subjectName}` : `Jogou Perguntados: ${match.subjectName}` });
    }
  }
  for (const player of active) {
    await notify(player.userId, { kind: 'perguntados', key: `perguntados-fim:${match.id}`, title: podium[0] ? `Perguntados: ${podium[0].userId === player.userId ? 'você venceu!' : `${publicName(podium[0].name)} venceu`}` : 'Perguntados encerrado', body: match.subjectName, link: { page: 'perguntados', params: { id: match.id } } }).catch(() => {});
  }
  return { ...match, status: 'encerrada', finishedAt };
}

async function underDailyCap(userId, now) {
  const today = saoPauloDay(new Date(now));
  const rows = pool
    ? (await pool.query(`SELECT created_at AS "createdAt" FROM xp_events WHERE user_id=$1 AND kind IN ('perguntados-vitoria','perguntados-partida') AND created_at > NOW() - INTERVAL '2 days'`, [userId])).rows
    : (memory.xpEvents || []).filter(item => item.userId === userId && item.kind.startsWith('perguntados-'));
  return rows.filter(row => saoPauloDay(new Date(row.createdAt)) === today).length < xpMatchesPerDay;
}

async function view(match, userId) {
  const players = await playersOf(match.id);
  const me = players.find(player => player.userId === userId);
  const closed = match.status === 'encerrada';
  const total = match.questions.length;
  const podium = ranked(players.filter(player => !player.declined));
  // Placar dos outros só aparece depois que eu terminei (ou a partida acabou), para não influenciar.
  const reveal = closed || Boolean(me?.finishedAt);
  let review = [];
  if (reveal && me) {
    const answers = pool
      ? (await pool.query('SELECT idx, choice, correct, ms, points FROM quiz_answers WHERE match_id=$1 AND user_id=$2', [match.id, userId])).rows
      : memory.quizAnswers.filter(item => item.matchId === match.id && item.userId === userId);
    review = match.questions.map((question, index) => {
      const answer = answers.find(item => item.idx === index);
      return { question: question.question, options: question.options, correctIndex: question.correctIndex, explanation: question.explanation, choice: answer ? answer.choice : null, correct: Boolean(answer?.correct), points: answer?.points || 0, ms: answer?.ms || 0 };
    });
  }
  return {
    id: match.id, subjectName: match.subjectName, topic: match.topic, status: match.status, error: match.error || '',
    owner: match.ownerId === userId, total, secondsPerQuestion, endsAt: match.endsAt ? new Date(match.endsAt).toISOString() : null,
    me: me ? { progress: me.currentIndex, finished: Boolean(me.finishedAt), declined: Boolean(me.declined), score: me.score, correct: me.correct, wrong: me.wrong, totalMs: me.totalMs } : null,
    players: players.map(player => ({
      id: player.userId, name: publicName(player.name || ''), avatarVersion: player.avatarVersion || '', me: player.userId === userId,
      declined: Boolean(player.declined), finished: Boolean(player.finishedAt), progress: player.currentIndex,
      ...(reveal ? { score: player.score, correct: player.correct, wrong: player.wrong, totalMs: player.totalMs, position: podium.findIndex(item => item.userId === player.userId) + 1 || null } : {})
    })).sort((a, b) => (a.position || 99) - (b.position || 99)),
    winner: closed && podium[0] ? { id: podium[0].userId, name: publicName(podium[0].name || '') } : null,
    review
  };
}

async function generate(matchId, input, invited, ownerName) {
  try {
    const result = await generator({ subject: input.subjectName, topic: input.topic || 'as aulas registradas', quantity: input.quantity, difficulty: 'Desafio', context: input.context });
    const questions = prepare(result.questions.slice(0, input.quantity));
    const endsAt = new Date(Date.now() + matchLifetimeMs);
    if (pool) await pool.query(`UPDATE quiz_matches SET status='aberta', questions=$2, ends_at=$3 WHERE id=$1 AND status='gerando'`, [matchId, JSON.stringify(questions), endsAt]);
    else Object.assign(memory.quizMatches.find(item => item.id === matchId) || {}, { status: 'aberta', questions, endsAt });
    for (const userId of invited) {
      await notify(userId, { kind: 'perguntados', key: `perguntados-convite:${matchId}`, title: `${publicName(ownerName)} desafiou você no Perguntados`, body: `${input.subjectName}${input.topic ? ` · ${input.topic}` : ''} · ${questions.length} perguntas`, link: { page: 'perguntados', params: { id: matchId } } }).catch(() => {});
    }
  } catch (error) {
    console.warn(`[perguntados] geração falhou: ${error?.message || error}`);
    const message = 'A IA não conseguiu montar as perguntas. Tente de novo com outro conteúdo ou mais anotações.';
    if (pool) await pool.query(`UPDATE quiz_matches SET status='erro', error=$2 WHERE id=$1`, [matchId, message]);
    else Object.assign(memory.quizMatches.find(item => item.id === matchId) || {}, { status: 'erro', error: message });
  }
}

export function registerQuizGameRoutes(app, requireAuth, aiRateLimit) {
  const route = action => async (req, res, next) => {
    try {
      await initQuizGame();
      await action(req, res);
    } catch (error) {
      next(error);
    }
  };
  const player = async (req, res) => {
    let match = await matchRow(req.params.id);
    const players = match ? await playersOf(match.id) : [];
    const me = players.find(item => item.userId === req.user.id);
    if (!match || !me) {
      res.status(404).json({ error: 'Partida não encontrada ou você não foi convidado.' });
      return null;
    }
    match = await settle(match, players);
    return { match, players, me };
  };

  app.post('/api/v1/perguntados', requireAuth, aiRateLimit, route(async (req, res) => {
    if (!aiReady()) return res.status(503).json({ error: 'A IA ainda não está configurada no servidor.' });
    const subjectName = oneLine(req.body?.subject, 100);
    const topic = oneLine(req.body?.topic, 180);
    const context = String(req.body?.context || '').slice(0, 9000);
    const quantity = Math.max(5, Math.min(10, Number.parseInt(req.body?.quantity, 10) || 8));
    const invited = [...new Set((Array.isArray(req.body?.userIds) ? req.body.userIds : []).map(String))].filter(id => id !== req.user.id).slice(0, 7);
    if (!subjectName) return res.status(400).json({ error: 'Escolha a disciplina.' });
    if (context.trim().length < 200) return res.status(400).json({ error: 'Há pouco material registrado nesta disciplina para montar perguntas boas. Escreva no Caderno ou registre o conteúdo das aulas primeiro.' });
    if (!invited.length) return res.status(400).json({ error: 'Convide pelo menos uma pessoa.' });
    const known = pool ? (await pool.query('SELECT id FROM users WHERE id = ANY($1)', [invited])).rows.map(row => row.id) : invited.filter(id => memory.users.some(user => user.id === id));
    const id = randomUUID();
    if (pool) await pool.query('INSERT INTO quiz_matches (id, owner_id, subject_name, topic) VALUES ($1,$2,$3,$4)', [id, req.user.id, subjectName, topic]);
    else memory.quizMatches.push({ id, ownerId: req.user.id, subjectName, topic, status: 'gerando', questions: [], createdAt: new Date() });
    for (const userId of [req.user.id, ...known]) {
      if (pool) await pool.query('INSERT INTO quiz_players (match_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, userId]);
      else memory.quizPlayers.push({ matchId: id, userId, currentIndex: 0, servedAt: null, score: 0, correct: 0, wrong: 0, totalMs: 0, finishedAt: null, declined: false });
    }
    const job = generate(id, { subjectName, topic, context, quantity }, known, req.user.name);
    if (generator !== generateQuestions) await job; // nos testes, espera a geração (falsa) terminar
    return res.status(202).json(await view(await matchRow(id), req.user.id));
  }));

  app.get('/api/v1/perguntados', requireAuth, route(async (req, res) => {
    const ids = pool
      ? (await pool.query(`SELECT m.id FROM quiz_matches m JOIN quiz_players p ON p.match_id=m.id AND p.user_id=$1 AND NOT p.declined ORDER BY m.created_at DESC LIMIT 30`, [req.user.id])).rows.map(row => row.id)
      : memory.quizPlayers.filter(item => item.userId === req.user.id && !item.declined).map(item => item.matchId).reverse().slice(0, 30);
    const list = [];
    for (const id of ids) {
      let match = await matchRow(id);
      match = await settle(match, await playersOf(id));
      list.push(await view(match, req.user.id));
    }
    return res.json(list.map(({ review, ...item }) => item));
  }));

  // Ranking do jogo: pontos somados das partidas encerradas (só quem terminou), vitórias e partidas.
  app.get('/api/v1/perguntados/ranking', requireAuth, route(async (req, res) => {
    const rows = pool
      ? (await pool.query(`SELECT p.user_id AS "userId", p.match_id AS "matchId", p.score, p.total_ms AS "totalMs", u.name, u.avatar_version AS "avatarVersion"
          FROM quiz_players p JOIN quiz_matches m ON m.id=p.match_id JOIN users u ON u.id=p.user_id
          WHERE m.status='encerrada' AND p.finished_at IS NOT NULL AND NOT p.declined`)).rows
      : memory.quizPlayers.filter(item => item.finishedAt && !item.declined && memory.quizMatches.find(match => match.id === item.matchId)?.status === 'encerrada')
        .map(item => ({ ...item, name: memoryUser(item.userId).name, avatarVersion: memoryUser(item.userId).avatar_version }));
    const byMatch = new Map();
    for (const row of rows) byMatch.set(row.matchId, [...(byMatch.get(row.matchId) || []), row]);
    const table = new Map();
    for (const group of byMatch.values()) {
      if (group.length < 2) continue;
      const winner = [...group].sort((a, b) => b.score - a.score || a.totalMs - b.totalMs)[0];
      for (const row of group) {
        const item = table.get(row.userId) || { id: row.userId, name: publicName(row.name || ''), avatarVersion: row.avatarVersion || '', points: 0, wins: 0, matches: 0 };
        item.points += row.score;
        item.matches += 1;
        if (row.userId === winner.userId) item.wins += 1;
        table.set(row.userId, item);
      }
    }
    const items = [...table.values()].sort((a, b) => b.points - a.points || b.wins - a.wins).map((item, index) => ({ ...item, position: index + 1, me: item.id === req.user.id }));
    return res.json({ items: items.slice(0, 20), me: items.find(item => item.me) || null });
  }));

  app.get('/api/v1/perguntados/:id', requireAuth, route(async (req, res) => {
    const found = await player(req, res);
    if (!found) return undefined;
    return res.json(await view(found.match, req.user.id));
  }));

  // Entrega a pergunta atual. A primeira entrega marca o início do relógio; pedir de novo não reinicia.
  app.post('/api/v1/perguntados/:id/pergunta', requireAuth, route(async (req, res) => {
    const found = await player(req, res);
    if (!found) return undefined;
    const { match, me } = found;
    if (match.status !== 'aberta') return res.status(409).json({ error: match.status === 'gerando' ? 'As perguntas ainda estão sendo preparadas.' : 'Esta partida já terminou.' });
    if (me.declined) return res.status(409).json({ error: 'Você recusou esta partida.' });
    if (me.finishedAt) return res.status(409).json({ error: 'Você já respondeu todas as perguntas.' });
    const servedAt = me.servedAt ? new Date(me.servedAt) : new Date();
    if (!me.servedAt) await updatePlayer(match.id, req.user.id, { servedAt });
    const question = match.questions[me.currentIndex];
    const leftMs = Math.max(0, secondsPerQuestion * 1000 - (Date.now() - servedAt.getTime()));
    return res.json({ index: me.currentIndex, total: match.questions.length, question: question.question, options: question.options, difficulty: question.difficulty, secondsPerQuestion, leftMs, score: me.score });
  }));

  app.post('/api/v1/perguntados/:id/resposta', requireAuth, route(async (req, res) => {
    const found = await player(req, res);
    if (!found) return undefined;
    const { match, me } = found;
    if (match.status !== 'aberta' || me.finishedAt || me.declined) return res.status(409).json({ error: 'Esta partida não aceita mais respostas.' });
    const index = Number.parseInt(req.body?.index, 10);
    if (index !== me.currentIndex || !me.servedAt) return res.status(409).json({ error: 'Esta pergunta já foi respondida. Atualize a tela.' });
    const question = match.questions[index];
    const raw = req.body?.choice;
    const choice = Number.isInteger(raw) && raw >= 0 && raw < 4 ? raw : null;
    const limitMs = secondsPerQuestion * 1000;
    const ms = Math.max(0, Date.now() - new Date(me.servedAt).getTime());
    const late = ms > limitMs + graceMs;
    const answered = late ? null : choice;
    const correct = answered !== null && answered === question.correctIndex;
    const points = correct ? 100 + Math.round(50 * Math.max(0, 1 - Math.min(ms, limitMs) / limitMs)) : answered === null ? 0 : -25;
    const usedMs = Math.min(ms, limitMs);
    if (pool) {
      const saved = await pool.query('INSERT INTO quiz_answers (match_id, user_id, idx, choice, correct, ms, points) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING', [match.id, req.user.id, index, answered, correct, usedMs, points]);
      if (!saved.rowCount) return res.status(409).json({ error: 'Esta pergunta já foi respondida. Atualize a tela.' });
    } else {
      if (memory.quizAnswers.some(item => item.matchId === match.id && item.userId === req.user.id && item.idx === index)) return res.status(409).json({ error: 'Esta pergunta já foi respondida. Atualize a tela.' });
      memory.quizAnswers.push({ matchId: match.id, userId: req.user.id, idx: index, choice: answered, correct, ms: usedMs, points });
    }
    const last = index + 1 >= match.questions.length;
    const next = { currentIndex: index + 1, servedAt: null, score: me.score + points, correct: me.correct + (correct ? 1 : 0), wrong: me.wrong + (correct ? 0 : 1), totalMs: me.totalMs + usedMs, ...(last ? { finishedAt: new Date() } : {}) };
    await updatePlayer(match.id, req.user.id, next);
    if (last) await settle(match, await playersOf(match.id));
    return res.json({ correct, late, choice: answered, correctIndex: question.correctIndex, explanation: question.explanation, points, score: next.score, finished: last });
  }));

  app.post('/api/v1/perguntados/:id/recusar', requireAuth, route(async (req, res) => {
    const found = await player(req, res);
    if (!found) return undefined;
    if (found.match.ownerId === req.user.id) return res.status(400).json({ error: 'Quem criou a partida não pode recusar.' });
    if (found.me.currentIndex > 0) return res.status(409).json({ error: 'Você já começou a jogar esta partida.' });
    await updatePlayer(found.match.id, req.user.id, { declined: true });
    await settle(found.match, await playersOf(found.match.id));
    return res.json({ declined: true });
  }));
}
