import { randomUUID } from 'node:crypto';
import { initStore, memory, pool } from './store.js';
import { publicName } from './social.js';

// Fases da Lua: um mood por dia (data de São Paulo), a Constelação da Semana e a Rádio das Estrelinhas.
// O mood é uma brincadeira, não uma avaliação: na constelação só entra quem ligou "Aparecer na Constelação"
// (preferences.lunarPublic), com apelido ou nome público. Músicas são vistas por todas as contas,
// com os dados que o próprio Spotify devolve para o link.

export const moods = ['fantasma', 'amanha', 'focado', 'preguicoso', 'iluminado', 'sobrevivente', 'ansioso', 'era'];
export const songCategories = ['Foco', 'Preguiça', 'Ansiedade pré-prova', 'Motivação', 'Relaxar', 'Sobrevivência acadêmica'];
const maxListed = 200;

let ready;
function initLunar() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lunar_moods (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        mood_date TEXT NOT NULL, mood TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE UNIQUE INDEX IF NOT EXISTS lunar_moods_day_idx ON lunar_moods(user_id, mood_date);
      CREATE TABLE IF NOT EXISTS lunar_songs (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        spotify_type TEXT NOT NULL, spotify_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', artist TEXT NOT NULL DEFAULT '',
        image TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE UNIQUE INDEX IF NOT EXISTS lunar_songs_unique_idx ON lunar_songs(user_id, spotify_type, spotify_id);
      CREATE INDEX IF NOT EXISTS lunar_songs_created_idx ON lunar_songs(created_at DESC)`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

export const todayInBrazil = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
const shiftDay = (iso, days) => {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
// Semana de segunda a domingo.
export const weekStart = iso => shiftDay(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));

const parse = value => {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
};
const clean = (value, max) => (typeof value === 'string' ? value.replace(/[\u0000-\u001f]/g, ' ').trim().replace(/\s+/g, ' ').slice(0, max) : '');
const memoryMoods = () => (memory.moods ||= []);
const memorySongs = () => (memory.songs ||= []);

// ---------- Moods ----------

export async function listMoods(userId) {
  await initLunar();
  if (pool) return (await pool.query('SELECT mood_date AS date, mood FROM lunar_moods WHERE user_id=$1 ORDER BY mood_date', [userId])).rows;
  return memoryMoods().filter(row => row.userId === userId).sort((a, b) => a.date.localeCompare(b.date)).map(({ date, mood }) => ({ date, mood }));
}

async function saveTodayMood(userId, mood, today) {
  await initLunar();
  if (pool) {
    const row = (await pool.query(`INSERT INTO lunar_moods (id,user_id,mood_date,mood) VALUES ($1,$2,$3,$4)
      ON CONFLICT (user_id, mood_date) DO UPDATE SET mood=$4, updated_at=NOW()
      RETURNING mood_date AS date, mood, (xmax = 0) AS created`, [randomUUID(), userId, today, mood])).rows[0];
    return row;
  }
  const existing = memoryMoods().find(row => row.userId === userId && row.date === today);
  if (existing) {
    existing.mood = mood;
    return { date: today, mood, created: false };
  }
  memoryMoods().push({ userId, date: today, mood });
  return { date: today, mood, created: true };
}

// ---------- Constelação da Semana ----------

async function participants() {
  const rows = pool ? (await pool.query('SELECT id, name, avatar_version, preferences FROM users')).rows : memory.users;
  return rows.filter(row => parse(row.preferences).lunarPublic === true).slice(0, maxListed);
}

export const displayName = row => clean(parse(row.preferences).nickname, 30) || publicName(row.name);
const displayAvatar = row => (parse(row.preferences).lunarShowPhoto === false ? '' : row.avatar_version || '');

async function weekMoods(userIds, from, to) {
  if (!userIds.length) return [];
  if (pool) {
    return (await pool.query('SELECT user_id AS "userId", mood_date AS date, mood FROM lunar_moods WHERE user_id = ANY($1) AND mood_date BETWEEN $2 AND $3',
      [userIds, from, to])).rows;
  }
  return memoryMoods().filter(row => userIds.includes(row.userId) && row.date >= from && row.date <= to);
}

// Pontos = dias distintos com aquele mood na semana (um registro por dia, então cada linha é um dia).
// Desempate: quem registrou primeiro na semana; depois, ordem alfabética do nome exibido.
export function rankWeek(people, rows, mood = '') {
  const scores = new Map();
  for (const row of rows) {
    if (mood && row.mood !== mood) continue;
    const score = scores.get(row.userId) || { days: new Set(), first: row.date };
    score.days.add(row.date);
    if (row.date < score.first) score.first = row.date;
    scores.set(row.userId, score);
  }
  return people
    .filter(person => scores.has(person.id))
    .map(person => ({ ...person, days: scores.get(person.id).days.size, first: scores.get(person.id).first }))
    .sort((a, b) => b.days - a.days || a.first.localeCompare(b.first) || a.name.localeCompare(b.name, 'pt-BR'))
    .map(({ first: _first, ...item }, index) => ({ ...item, position: index + 1 }));
}

// ---------- Rádio das Estrelinhas ----------

// Aceita só links do open.spotify.com; o resto (inclusive links encurtados) é recusado antes de qualquer consulta.
export function parseSpotify(value) {
  const match = clean(value, 400).match(/^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|episode|show)\/([A-Za-z0-9]{8,40})(?:[/?#].*)?$/);
  return match ? { type: match[1], id: match[2] } : null;
}

let spotifyToken = { value: '', expiresAt: 0 };
async function spotifyAppToken() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) return '';
  if (spotifyToken.value && spotifyToken.expiresAt > Date.now() + 60_000) return spotifyToken.value;
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    signal: AbortSignal.timeout(8000),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64')}`
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) return '';
  const payload = await response.json();
  spotifyToken = { value: payload.access_token, expiresAt: Date.now() + payload.expires_in * 1000 };
  return spotifyToken.value;
}

// Nome do artista (ou dono da playlist, ou programa do episódio), quando a API do Spotify está configurada.
async function spotifyArtist({ type, id }) {
  try {
    const token = await spotifyAppToken();
    if (!token) return '';
    const plural = { track: 'tracks', album: 'albums', playlist: 'playlists', episode: 'episodes', show: 'shows' }[type];
    const response = await fetch(`https://api.spotify.com/v1/${plural}/${id}?market=BR`, { signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) return '';
    const item = await response.json();
    if (item.artists) return item.artists.map(artist => artist.name).join(', ');
    if (type === 'playlist') return item.owner?.display_name || '';
    if (type === 'episode') return item.show?.name || '';
    if (type === 'show') return item.publisher || '';
    return '';
  } catch {
    return '';
  }
}

export async function spotifyMetadata(link, fetcher = fetch) {
  const url = `https://open.spotify.com/${link.type}/${link.id}`;
  let response;
  try {
    response = await fetcher(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
  } catch {
    return { error: 'Não foi possível consultar o Spotify agora. Tente de novo em instantes.', status: 502 };
  }
  if (response.status === 404 || response.status === 400) return { error: 'O Spotify não encontrou esse conteúdo. Confira se o link está certo e é público.', status: 400 };
  if (!response.ok) return { error: 'O Spotify não respondeu agora. Tente de novo em instantes.', status: 502 };
  const payload = await response.json().catch(() => ({}));
  if (!payload.title) return { error: 'O Spotify não devolveu os dados desse link.', status: 502 };
  return {
    title: clean(payload.title, 200),
    image: /^https:\/\/[\w.-]*(scdn\.co|spotifycdn\.com)\//.test(payload.thumbnail_url || '') ? payload.thumbnail_url.slice(0, 500) : '',
    artist: clean(await spotifyArtist(link), 200)
  };
}

const songSelect = `SELECT s.id, s.user_id AS "userId", s.spotify_type AS type, s.spotify_id AS "spotifyId", s.title, s.artist, s.image,
  s.category, s.comment, s.created_at AS "createdAt", u.name AS "authorName", u.preferences AS "authorPreferences"
  FROM lunar_songs s JOIN users u ON u.id=s.user_id`;

const publicSong = (row, viewerId) => ({
  id: row.id, type: row.type, spotifyId: row.spotifyId, url: `https://open.spotify.com/${row.type}/${row.spotifyId}`,
  title: row.title, artist: row.artist, image: row.image, category: row.category, comment: row.comment,
  createdAt: new Date(row.createdAt).toISOString(),
  author: { name: displayName({ name: row.authorName, preferences: row.authorPreferences }) },
  mine: row.userId === viewerId
});

async function listSongs(viewerId, category) {
  await initLunar();
  if (pool) {
    const rows = category
      ? (await pool.query(`${songSelect} WHERE s.category=$1 ORDER BY s.created_at DESC LIMIT 120`, [category])).rows
      : (await pool.query(`${songSelect} ORDER BY s.created_at DESC LIMIT 120`)).rows;
    return rows.map(row => publicSong(row, viewerId));
  }
  return memorySongs()
    .filter(row => !category || row.category === category)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 120)
    .map(row => {
      const user = memory.users.find(item => item.id === row.userId) || {};
      return publicSong({ ...row, authorName: user.name, authorPreferences: user.preferences }, viewerId);
    });
}

// Indicações da própria conta, para a Relíquia Musical.
export async function listOwnSongs(userId) {
  await initLunar();
  if (pool) return (await pool.query(`SELECT id, to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS "createdOn" FROM lunar_songs WHERE user_id=$1`, [userId])).rows;
  return memorySongs().filter(row => row.userId === userId).map(row => ({ id: row.id, createdOn: todayInBrazil(new Date(row.createdAt)) }));
}

async function findSong(id) {
  if (pool) return (await pool.query('SELECT id, user_id AS "userId" FROM lunar_songs WHERE id=$1', [id])).rows[0];
  return memorySongs().find(row => row.id === id);
}

const songWindows = new Map();
function songRateLimit(req, res, next) {
  const now = Date.now();
  const recent = (songWindows.get(req.user.id) || []).filter(time => now - time < 10 * 60_000);
  if (recent.length >= 15) return res.status(429).json({ error: 'Muitas indicações seguidas. Aguarde alguns minutos.' });
  songWindows.set(req.user.id, [...recent, now]);
  return next();
}

// Os testes trocam a consulta ao Spotify por uma resposta fixa.
export const lunarHooks = { metadata: spotifyMetadata };

export function registerLunarRoutes(app, requireAuth) {
  app.get('/api/v1/lunar/moods', requireAuth, async (req, res, next) => {
    try {
      return res.json({ today: todayInBrazil(), items: await listMoods(req.user.id) });
    } catch (error) {
      return next(error);
    }
  });

  // Só o dia de hoje pode ser registrado ou trocado; os dias anteriores ficam como estão.
  app.put('/api/v1/lunar/moods/today', requireAuth, async (req, res, next) => {
    try {
      const mood = clean(req.body?.mood, 20);
      if (!moods.includes(mood)) return res.status(400).json({ error: 'Escolha um dos moods da lista.' });
      const saved = await saveTodayMood(req.user.id, mood, todayInBrazil());
      return res.status(saved.created ? 201 : 200).json({ date: saved.date, mood: saved.mood, created: Boolean(saved.created) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/lunar/constellation', requireAuth, async (req, res, next) => {
    try {
      await initLunar();
      const requested = /^\d{4}-\d{2}-\d{2}$/.test(req.query.semana || '') ? req.query.semana : todayInBrazil();
      const from = weekStart(requested);
      const to = shiftDay(from, 6);
      const people = (await participants()).map(row => ({ id: row.id, name: displayName(row), avatarVersion: displayAvatar(row), me: row.id === req.user.id }));
      const rows = await weekMoods(people.map(person => person.id), from, to);
      const top = list => list.slice(0, 3).map(({ id, ...item }) => ({ ...item, userId: item.avatarVersion ? id : '' }));
      return res.json({
        week: { from, to },
        optedIn: parse(req.user.preferences).lunarPublic === true,
        general: top(rankWeek(people, rows)),
        byMood: Object.fromEntries(moods.map(mood => [mood, top(rankWeek(people, rows, mood))])),
        participants: people.length
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/lunar/songs', requireAuth, async (req, res, next) => {
    try {
      const category = songCategories.includes(req.query.categoria) ? req.query.categoria : '';
      return res.json(await listSongs(req.user.id, category));
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/lunar/songs', requireAuth, songRateLimit, async (req, res, next) => {
    try {
      await initLunar();
      const link = parseSpotify(req.body?.url);
      if (!link) {
        return res.status(400).json({ error: /spotify\.link|spoti\.fi/.test(String(req.body?.url || '')) ? 'Links encurtados não funcionam. Abra a música no Spotify e copie o link completo (open.spotify.com).' : 'Cole um link do Spotify que comece com https://open.spotify.com/.' });
      }
      const category = clean(req.body?.category, 40);
      if (!songCategories.includes(category)) return res.status(400).json({ error: 'Escolha o mood da indicação.' });
      const comment = clean(req.body?.comment, 280);
      const duplicate = pool
        ? (await pool.query('SELECT 1 FROM lunar_songs WHERE user_id=$1 AND spotify_type=$2 AND spotify_id=$3', [req.user.id, link.type, link.id])).rowCount
        : memorySongs().some(row => row.userId === req.user.id && row.type === link.type && row.spotifyId === link.id);
      if (duplicate) return res.status(409).json({ error: 'Você já indicou essa música. Edite a indicação existente.' });
      const info = await lunarHooks.metadata(link);
      if (info.error) return res.status(info.status).json({ error: info.error });
      const song = { id: randomUUID(), userId: req.user.id, type: link.type, spotifyId: link.id, ...info, category, comment, createdAt: Date.now() };
      if (pool) {
        await pool.query('INSERT INTO lunar_songs (id,user_id,spotify_type,spotify_id,title,artist,image,category,comment) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [song.id, song.userId, song.type, song.spotifyId, song.title, song.artist, song.image, category, comment]);
      } else memorySongs().push(song);
      return res.status(201).json(publicSong({ ...song, authorName: req.user.name, authorPreferences: req.user.preferences }, req.user.id));
    } catch (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Você já indicou essa música. Edite a indicação existente.' });
      return next(error);
    }
  });

  app.patch('/api/v1/lunar/songs/:id', requireAuth, async (req, res, next) => {
    try {
      await initLunar();
      const song = await findSong(req.params.id);
      if (!song) return res.status(404).json({ error: 'Indicação não encontrada.' });
      if (song.userId !== req.user.id) return res.status(403).json({ error: 'Só quem indicou pode editar.' });
      const category = clean(req.body?.category, 40);
      if (!songCategories.includes(category)) return res.status(400).json({ error: 'Escolha o mood da indicação.' });
      const comment = clean(req.body?.comment, 280);
      if (pool) await pool.query('UPDATE lunar_songs SET category=$2, comment=$3, updated_at=NOW() WHERE id=$1', [song.id, category, comment]);
      else Object.assign(song, { category, comment });
      return res.json({ id: song.id, category, comment });
    } catch (error) {
      return next(error);
    }
  });

  app.delete('/api/v1/lunar/songs/:id', requireAuth, async (req, res, next) => {
    try {
      await initLunar();
      const song = await findSong(req.params.id);
      if (!song) return res.status(404).json({ error: 'Indicação não encontrada.' });
      if (song.userId !== req.user.id) return res.status(403).json({ error: 'Só quem indicou pode excluir.' });
      if (pool) await pool.query('DELETE FROM lunar_songs WHERE id=$1', [song.id]);
      else memory.songs = memorySongs().filter(row => row.id !== song.id);
      return res.status(204).end();
    } catch (error) {
      return next(error);
    }
  });
}
