import express from 'express';
import { publicName } from './social.js';
import { initStore, memory, pool } from './store.js';
import { initEntities } from './entities.js';

// Apresentação do perfil (versão 4.0): capa, música, leitura atual, cor, matéria favorita e frase curta.
// "Mais estudado" é calculado das sessões do Ritual dos últimos 30 dias (nunca digitado).
// Quem estiver logado vê a apresentação de outra pessoa; quem quiser esconde em "visível na comunidade".
// Nunca mostra e-mail, RA, nome completo, notas, faltas ou registros de aula.

export const coverMaxBytes = 680 * 1024;
const coverTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const accentColors = ['#7c5cff', '#c084e8', '#e07fa8', '#e59a6b', '#e8b64c', '#58b39a', '#5aa9d6', '#6f8cf6'];
export const coverThemes = ['noite', 'aurora', 'pergaminho', 'floresta', 'mar'];
const oneLine = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Só links de música conhecidos (abre fora do Grimiau; nada é incorporado na página).
export function cleanMusicUrl(value) {
  const raw = oneLine(value, 300);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, '');
    if (url.protocol !== 'https:') return null;
    if (['open.spotify.com', 'music.youtube.com', 'youtube.com', 'youtu.be', 'music.apple.com', 'deezer.com', 'soundcloud.com'].includes(host)) return url.toString();
  } catch {
    return null;
  }
  return null;
}

let ready;
export function initShowcase() {
  ready ||= (async () => {
    await initStore();
    await initEntities();
    if (!pool) {
      memory.showcases ||= [];
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profile_showcases (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        visible BOOLEAN NOT NULL DEFAULT TRUE, accent TEXT NOT NULL DEFAULT '', cover_theme TEXT NOT NULL DEFAULT 'noite',
        cover BYTEA, cover_mime TEXT, cover_version TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '', music_title TEXT NOT NULL DEFAULT '', music_url TEXT NOT NULL DEFAULT '',
        reading_title TEXT NOT NULL DEFAULT '', reading_author TEXT NOT NULL DEFAULT '', favorite_subject TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ DEFAULT NOW());`);
  })();
  return ready;
}

const empty = { visible: true, accent: '', coverTheme: 'noite', coverVersion: '', headline: '', musicTitle: '', musicUrl: '', readingTitle: '', readingAuthor: '', favoriteSubject: '' };

async function showcaseOf(userId) {
  const row = pool
    ? (await pool.query(`SELECT visible, accent, cover_theme AS "coverTheme", cover_version AS "coverVersion", headline, music_title AS "musicTitle", music_url AS "musicUrl",
        reading_title AS "readingTitle", reading_author AS "readingAuthor", favorite_subject AS "favoriteSubject" FROM profile_showcases WHERE user_id=$1`, [userId])).rows[0]
    : memory.showcases.find(item => item.userId === userId);
  return { ...empty, ...(row || {}), userId: undefined, cover: undefined, coverMime: undefined };
}

// Disciplina e conteúdo com mais tempo de Ritual nos últimos 30 dias.
async function mostStudied(userId) {
  const since = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - 30 * 86_400_000));
  const rows = pool
    ? (await pool.query(`SELECT s.duration_seconds AS "seconds", s.topic, sub.name AS subject FROM study_sessions s LEFT JOIN subjects sub ON sub.id=s.subject_id
        WHERE s.user_id=$1 AND s.session_date >= $2`, [userId, since])).rows
    : (memory.entities?.study_sessions || []).filter(item => item.userId === userId && String(item.date) >= since)
      .map(item => ({ seconds: item.durationSeconds, topic: item.topic, subject: memory.subjects.find(subject => subject.id === item.subjectId)?.name }));
  const top = key => {
    const sums = new Map();
    for (const row of rows) if (row[key]) sums.set(row[key], (sums.get(row[key]) || 0) + Number(row.seconds || 0));
    const best = [...sums.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? { name: best[0], minutes: Math.round(best[1] / 60) } : null;
  };
  return { subject: top('subject'), topic: top('topic'), minutes: Math.round(rows.reduce((sum, row) => sum + Number(row.seconds || 0), 0) / 60) };
}

export function registerShowcaseRoutes(app, requireAuth) {
  const route = action => async (req, res, next) => {
    try {
      await initShowcase();
      await action(req, res);
    } catch (error) {
      next(error);
    }
  };

  app.get('/api/v1/vitrine', requireAuth, route(async (req, res) => res.json({ ...(await showcaseOf(req.user.id)), mostStudied: await mostStudied(req.user.id), accents: accentColors, themes: coverThemes })));

  app.put('/api/v1/vitrine', requireAuth, route(async (req, res) => {
    const current = await showcaseOf(req.user.id);
    const body = req.body || {};
    const pick = (key, max) => (body[key] !== undefined ? oneLine(body[key], max) : current[key]);
    const musicUrl = body.musicUrl !== undefined ? cleanMusicUrl(body.musicUrl) : current.musicUrl;
    if (musicUrl === null) return res.status(400).json({ error: 'Use um link https do Spotify, YouTube Music, Apple Music, Deezer ou SoundCloud.' });
    const next = {
      visible: body.visible !== undefined ? body.visible !== false : current.visible,
      accent: body.accent !== undefined ? (accentColors.includes(body.accent) ? body.accent : '') : current.accent,
      coverTheme: body.coverTheme !== undefined ? (coverThemes.includes(body.coverTheme) ? body.coverTheme : 'noite') : current.coverTheme,
      headline: pick('headline', 120), musicTitle: pick('musicTitle', 100), musicUrl,
      readingTitle: pick('readingTitle', 120), readingAuthor: pick('readingAuthor', 80), favoriteSubject: pick('favoriteSubject', 80)
    };
    if (pool) {
      await pool.query(`INSERT INTO profile_showcases (user_id, visible, accent, cover_theme, headline, music_title, music_url, reading_title, reading_author, favorite_subject, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) ON CONFLICT (user_id) DO UPDATE SET visible=$2, accent=$3, cover_theme=$4, headline=$5, music_title=$6, music_url=$7,
        reading_title=$8, reading_author=$9, favorite_subject=$10, updated_at=NOW()`,
      [req.user.id, next.visible, next.accent, next.coverTheme, next.headline, next.musicTitle, next.musicUrl, next.readingTitle, next.readingAuthor, next.favoriteSubject]);
    } else {
      const found = memory.showcases.find(item => item.userId === req.user.id);
      if (found) Object.assign(found, next);
      else memory.showcases.push({ userId: req.user.id, coverVersion: '', ...next });
    }
    return res.json({ ...(await showcaseOf(req.user.id)), mostStudied: await mostStudied(req.user.id), accents: accentColors, themes: coverThemes });
  }));

  // Capa: imagem reduzida no aparelho (até 680 KB). data vazio remove a capa.
  app.put('/api/v1/vitrine/capa', express.json({ limit: '1mb' }), requireAuth, route(async (req, res) => {
    const remove = !req.body?.data;
    const mime = oneLine(req.body?.mime, 30).toLowerCase();
    const bytes = remove ? null : Buffer.from(String(req.body.data), 'base64');
    if (!remove && !coverTypes.has(mime)) return res.status(400).json({ error: 'Use uma imagem JPG, PNG ou WEBP.' });
    if (!remove && (!bytes.length || bytes.length > coverMaxBytes)) return res.status(413).json({ error: 'A capa precisa ter até 680 KB.' });
    const version = remove ? '' : String(Date.now());
    if (pool) {
      await pool.query(`INSERT INTO profile_showcases (user_id, cover, cover_mime, cover_version) VALUES ($1,$2,$3,$4)
        ON CONFLICT (user_id) DO UPDATE SET cover=$2, cover_mime=$3, cover_version=$4, updated_at=NOW()`, [req.user.id, bytes, remove ? null : mime, version]);
    } else {
      const found = memory.showcases.find(item => item.userId === req.user.id);
      const fields = { cover: bytes, coverMime: remove ? null : mime, coverVersion: version };
      if (found) Object.assign(found, fields);
      else memory.showcases.push({ ...empty, userId: req.user.id, ...fields });
    }
    return res.json({ coverVersion: version });
  }));

  app.get('/api/v1/vitrine/capa/:userId', requireAuth, route(async (req, res) => {
    const row = pool
      ? (await pool.query('SELECT cover, cover_mime AS "coverMime", visible FROM profile_showcases WHERE user_id=$1', [req.params.userId])).rows[0]
      : memory.showcases.find(item => item.userId === req.params.userId);
    if (!row?.cover || (!row.visible && req.params.userId !== req.user.id)) return res.status(404).json({ error: 'Sem capa.' });
    res.set('Content-Type', row.coverMime);
    res.set('Cache-Control', 'private, max-age=86400');
    return res.send(Buffer.from(row.cover));
  }));

  // Apresentação de outra pessoa (só o que é público).
  app.get('/api/v1/vitrine/:userId', requireAuth, route(async (req, res) => {
    const user = pool
      ? (await pool.query('SELECT id, name, avatar_version AS "avatarVersion", course FROM users WHERE id=$1', [req.params.userId])).rows[0]
      : memory.users.find(item => item.id === req.params.userId);
    if (!user) return res.status(404).json({ error: 'Pessoa não encontrada.' });
    const showcase = await showcaseOf(user.id);
    const me = user.id === req.user.id;
    if (!showcase.visible && !me) return res.json({ id: user.id, name: publicName(user.name), avatarVersion: user.avatarVersion || user.avatar_version || '', hidden: true });
    return res.json({ id: user.id, name: publicName(user.name), avatarVersion: user.avatarVersion || user.avatar_version || '', course: oneLine(user.course, 100), me, hidden: false, ...showcase, mostStudied: await mostStudied(user.id) });
  }));
}
