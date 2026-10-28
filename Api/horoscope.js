import { callGemini } from './ai.js';
import { initStore, pool } from './store.js';

// Horóscopo do dia. Fonte: horoscope-app-api (textos do horoscope.com, em inglês), pedida com a data de São Paulo.
// O Gemini traduz e encurta para português. O resultado fica em cache por signo e data, então cada signo
// consulta a fonte uma vez por dia. Se a fonte devolver outra data ou falhar, a rota informa indisponibilidade:
// nunca mostra a previsão de outro dia como se fosse a de hoje.

export const signs = {
  aries: 'Aries', touro: 'Taurus', gemeos: 'Gemini', cancer: 'Cancer', leao: 'Leo', virgem: 'Virgo',
  libra: 'Libra', escorpiao: 'Scorpio', sagitario: 'Sagittarius', capricornio: 'Capricorn', aquario: 'Aquarius', peixes: 'Pisces'
};
export const sourceName = 'horoscope.com, via horoscope-app-api';

export const saoPauloDate = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const memoryCache = new Map();
let ready;
function initHoroscope() {
  ready ||= (async () => {
    await initStore();
    if (!pool) return;
    await pool.query(`CREATE TABLE IF NOT EXISTS horoscope_cache (
      sign TEXT NOT NULL, day TEXT NOT NULL, text TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY (sign, day))`);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

async function cached(sign, day) {
  await initHoroscope();
  if (pool) return (await pool.query('SELECT text FROM horoscope_cache WHERE sign=$1 AND day=$2', [sign, day])).rows[0]?.text;
  return memoryCache.get(`${sign}|${day}`);
}

async function store(sign, day, text) {
  if (pool) {
    await pool.query('INSERT INTO horoscope_cache (sign,day,text) VALUES ($1,$2,$3) ON CONFLICT (sign,day) DO NOTHING', [sign, day, text]);
    await pool.query("DELETE FROM horoscope_cache WHERE created_at < NOW() - INTERVAL '3 days'");
  } else memoryCache.set(`${sign}|${day}`, text);
}

// Pedidos simultâneos do mesmo signo no mesmo dia compartilham uma única consulta.
const inflight = new Map();

export async function dailyHoroscope(sign, day = saoPauloDate(), { fetchSource = fetch, translate = callGemini } = {}) {
  const hit = await cached(sign, day);
  if (hit) return { sign, date: day, text: hit, source: sourceName };
  const key = `${sign}|${day}`;
  if (!inflight.has(key)) {
    inflight.set(key, (async () => {
      const response = await fetchSource(`https://horoscope-app-api.vercel.app/api/v1/get-horoscope/daily?sign=${signs[sign]}&day=${day}`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`fonte respondeu ${response.status}`);
      const payload = await response.json();
      const original = typeof payload?.data?.horoscope === 'string' ? payload.data.horoscope.trim() : '';
      if (payload?.data?.date !== day || !original) throw new Error('fonte sem a previsão de hoje');
      const { data } = await translate([{ text: `Traduza para o português do Brasil e resuma em no máximo 3 frases curtas, em tom leve e acolhedor, sem acrescentar previsões que não estejam no texto. Trate a pessoa por "você". Responda só com JSON: {"text":"..."}\n\nTEXTO:\n${original.slice(0, 2000)}` }], { maxOutputTokens: 400, timeout: 25_000, temperature: 0.3 });
      const text = typeof data?.text === 'string' ? data.text.trim().slice(0, 600) : '';
      if (!text) throw new Error('tradução vazia');
      await store(sign, day, text);
      return text;
    })().finally(() => inflight.delete(key)));
  }
  return { sign, date: day, text: await inflight.get(key), source: sourceName };
}

export function registerHoroscopeRoutes(app, requireAuth) {
  app.get('/api/v1/horoscope/:sign', requireAuth, async (req, res) => {
    const sign = String(req.params.sign || '').toLowerCase();
    if (!signs[sign]) return res.status(400).json({ error: 'Signo desconhecido.' });
    if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'O horóscopo está indisponível agora.' });
    try {
      return res.json(await dailyHoroscope(sign));
    } catch (error) {
      console.warn(`[horoscopo] ${sign}: ${error?.message || error}`);
      return res.status(503).json({ error: 'As estrelas estão nubladas: a previsão de hoje não chegou. Tente mais tarde.' });
    }
  });
}
