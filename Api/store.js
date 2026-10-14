import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const pool = connectionString
  // Timeouts curtos: se o banco cair ou expirar, as rotas respondem erro em segundos em vez de travar.
  ? new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
      max: 10,
      connectionTimeoutMillis: 10_000,
      query_timeout: 20_000
    })
  : null;

const memory = { users: [], sessions: new Map(), resets: new Map(), plans: [], diaries: [], materials: [], subjects: [] };
const resetLifetime = 60 * 60 * 1000;
let initialization;

const parseJson = (value, fallback) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(value || ''); } catch { return fallback; }
};

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    course: user.course || '',
    institution: user.institution || '',
    semester: user.semester || '',
    classDays: user.class_days ? user.class_days.split(',').filter(Boolean) : [],
    classTime: user.class_time || '',
    shift: user.shift || '',
    termStart: user.term_start || '',
    termEnd: user.term_end || '',
    preferences: parseJson(user.preferences, {}),
    onboardingDone: Boolean(user.onboarding_done)
  };
}

function passwordRecord(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}

function validPassword(password, salt, expected) {
  const actual = Buffer.from(passwordRecord(password, salt).hash, 'hex');
  const stored = Buffer.from(expected, 'hex');
  return actual.length === stored.length && timingSafeEqual(actual, stored);
}

const tokenHash = token => createHash('sha256').update(token).digest('hex');

export function hasDatabase() { return Boolean(pool); }
export { pool, memory };

export function initStore() {
  if (!pool) return Promise.resolve();
  // Se a criação das tabelas falhar (banco fora do ar), a próxima requisição tenta de novo.
  if (!initialization) initialization = pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
      course TEXT DEFAULT '', institution TEXT DEFAULT '', semester TEXT DEFAULT '',
      class_days TEXT DEFAULT '', class_time TEXT DEFAULT '', onboarding_done BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE users ADD COLUMN IF NOT EXISTS class_days TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS class_time TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_done BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS shift TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS term_start TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS term_end TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences TEXT DEFAULT '{}';
    CREATE TABLE IF NOT EXISTS password_resets (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, professor TEXT DEFAULT '', color TEXT NOT NULL,
      schedule TEXT DEFAULT '[]', start_date TEXT DEFAULT '', end_date TEXT DEFAULT '',
      position INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE TABLE IF NOT EXISTS study_plans (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL, topic TEXT NOT NULL, study_date TEXT DEFAULT '', study_time TEXT DEFAULT '',
      priority TEXT DEFAULT 'Média', status TEXT DEFAULT 'planejado', created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS diaries (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL, lesson_date TEXT NOT NULL, planned TEXT DEFAULT '', actual TEXT DEFAULT '',
      reached TEXT DEFAULT '', understood TEXT DEFAULT '', doubts TEXT DEFAULT '', notes TEXT DEFAULT '', references_text TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(user_id, subject, lesson_date)
    );
    CREATE TABLE IF NOT EXISTS study_materials (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL, material_type TEXT DEFAULT 'Link', subject TEXT DEFAULT '', url TEXT DEFAULT '', notes TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(error => {
    initialization = null;
    throw error;
  });
  return initialization;
}

export async function createUser(input) {
  await initStore();
  const email = input.email.toLowerCase();
  const existing = pool ? (await pool.query('SELECT id FROM users WHERE email=$1', [email])).rowCount : memory.users.some(user => user.email === email);
  if (existing) return null;
  const id = randomUUID();
  const password = passwordRecord(input.password);
  const user = { id, email, name: input.name, password_hash: password.hash, password_salt: password.salt, course: input.course || '', institution: input.institution || '', semester: input.semester || '', class_days: '', class_time: '', onboarding_done: false };
  if (pool) await pool.query('INSERT INTO users (id,email,name,password_hash,password_salt,course,institution,semester) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [id, email, user.name, user.password_hash, user.password_salt, user.course, user.institution, user.semester]);
  else memory.users.push(user);
  return createSession(user);
}

export async function loginUser(email, password) {
  await initStore();
  const user = pool ? (await pool.query('SELECT * FROM users WHERE email=$1', [email.toLowerCase()])).rows[0] : memory.users.find(item => item.email === email.toLowerCase());
  if (!user || !validPassword(password, user.password_salt, user.password_hash)) return null;
  return createSession(user);
}

async function createSession(user) {
  const token = randomBytes(32).toString('hex');
  const hash = tokenHash(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (pool) await pool.query('INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [hash, user.id, expiresAt]);
  else memory.sessions.set(hash, { userId: user.id, expiresAt });
  return { token, user: publicUser(user) };
}

export async function userFromToken(token) {
  if (!token) return null;
  await initStore();
  if (pool) return publicUser((await pool.query('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW()', [tokenHash(token)])).rows[0]);
  const session = memory.sessions.get(tokenHash(token));
  return session && session.expiresAt > new Date() ? publicUser(memory.users.find(user => user.id === session.userId)) : null;
}

export async function updateUser(userId, changes) {
  await initStore();
  if (pool) return publicUser((await pool.query(
    'UPDATE users SET name=$2,course=$3,institution=$4,semester=$5,class_days=$6,class_time=$7,onboarding_done=$8,shift=$9,term_start=$10,term_end=$11,preferences=$12 WHERE id=$1 RETURNING *',
    [userId, changes.name, changes.course, changes.institution, changes.semester, changes.classDays, changes.classTime, changes.onboardingDone,
      changes.shift, changes.termStart, changes.termEnd, JSON.stringify(changes.preferences)]
  )).rows[0]);
  const user = memory.users.find(item => item.id === userId);
  if (!user) return null;
  Object.assign(user, {
    name: changes.name,
    course: changes.course,
    institution: changes.institution,
    semester: changes.semester,
    class_days: changes.classDays,
    class_time: changes.classTime,
    onboarding_done: changes.onboardingDone,
    shift: changes.shift,
    term_start: changes.termStart,
    term_end: changes.termEnd,
    preferences: changes.preferences
  });
  return publicUser(user);
}

export async function endSession(token) {
  if (!token) return;
  await initStore();
  if (pool) await pool.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
  else memory.sessions.delete(tokenHash(token));
}

export async function createPasswordReset(email) {
  await initStore();
  const normalized = email.toLowerCase();
  const user = pool
    ? (await pool.query('SELECT id,name,email FROM users WHERE email=$1', [normalized])).rows[0]
    : memory.users.find(item => item.email === normalized);
  if (!user) return null;
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + resetLifetime);
  if (pool) {
    await pool.query('DELETE FROM password_resets WHERE user_id=$1', [user.id]);
    await pool.query('INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES ($1,$2,$3)', [tokenHash(token), user.id, expiresAt]);
  } else {
    for (const [hash, reset] of memory.resets) if (reset.userId === user.id) memory.resets.delete(hash);
    memory.resets.set(tokenHash(token), { userId: user.id, expiresAt });
  }
  return { token, name: user.name, email: user.email };
}

// O token é de uso único: é apagado antes de validar, e a troca encerra todas as sessões da conta.
export async function resetPassword(token, newPassword) {
  await initStore();
  const hash = tokenHash(token);
  const password = passwordRecord(newPassword);
  if (pool) {
    const reset = (await pool.query('DELETE FROM password_resets WHERE token_hash=$1 RETURNING user_id,expires_at', [hash])).rows[0];
    if (!reset || new Date(reset.expires_at) <= new Date()) return false;
    await pool.query('UPDATE users SET password_hash=$2,password_salt=$3 WHERE id=$1', [reset.user_id, password.hash, password.salt]);
    await pool.query('DELETE FROM sessions WHERE user_id=$1', [reset.user_id]);
    return true;
  }
  const reset = memory.resets.get(hash);
  memory.resets.delete(hash);
  if (!reset || reset.expiresAt <= new Date()) return false;
  const user = memory.users.find(item => item.id === reset.userId);
  Object.assign(user, { password_hash: password.hash, password_salt: password.salt });
  for (const [key, session] of memory.sessions) if (session.userId === user.id) memory.sessions.delete(key);
  return true;
}

const subjectColumns = 'id,name,professor,color,schedule,start_date AS "startDate",end_date AS "endDate",position';
const publicSubject = ({ userId: _userId, ...subject }) => ({ ...subject, schedule: parseJson(subject.schedule, []) });

export async function listSubjects(userId) {
  await initStore();
  if (pool) return (await pool.query(`SELECT ${subjectColumns} FROM subjects WHERE user_id=$1 ORDER BY position, created_at`, [userId])).rows.map(publicSubject);
  return memory.subjects.filter(subject => subject.userId === userId).sort((a, b) => a.position - b.position).map(publicSubject);
}

export async function addSubject(userId, subject) {
  await initStore();
  const position = pool
    ? (await pool.query('SELECT COALESCE(MAX(position),-1)+1 AS next FROM subjects WHERE user_id=$1', [userId])).rows[0].next
    : memory.subjects.filter(item => item.userId === userId).length;
  const item = { id: randomUUID(), ...subject, position };
  if (pool) await pool.query('INSERT INTO subjects (id,user_id,name,professor,color,schedule,start_date,end_date,position) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [item.id, userId, item.name, item.professor, item.color, JSON.stringify(item.schedule), item.startDate, item.endDate, item.position]);
  else memory.subjects.push({ ...item, userId });
  return item;
}

export async function updateSubject(userId, id, subject) {
  await initStore();
  if (pool) {
    const row = (await pool.query(`UPDATE subjects SET name=$3,professor=$4,color=$5,schedule=$6,start_date=$7,end_date=$8 WHERE id=$1 AND user_id=$2 RETURNING ${subjectColumns}`,
      [id, userId, subject.name, subject.professor, subject.color, JSON.stringify(subject.schedule), subject.startDate, subject.endDate])).rows[0];
    return row ? publicSubject(row) : null;
  }
  const item = memory.subjects.find(entry => entry.id === id && entry.userId === userId);
  if (!item) return null;
  Object.assign(item, subject);
  return publicSubject(item);
}

export async function removeSubject(userId, id) {
  await initStore();
  if (pool) return (await pool.query('DELETE FROM subjects WHERE id=$1 AND user_id=$2', [id, userId])).rowCount > 0;
  const index = memory.subjects.findIndex(subject => subject.id === id && subject.userId === userId);
  if (index < 0) return false;
  memory.subjects.splice(index, 1);
  return true;
}

// Recebe a lista completa de ids na nova ordem; ids de outras contas são ignorados pelo filtro de user_id.
export async function reorderSubjects(userId, ids) {
  await initStore();
  if (pool) {
    await Promise.all(ids.map((id, position) => pool.query('UPDATE subjects SET position=$3 WHERE id=$1 AND user_id=$2', [id, userId, position])));
  } else {
    ids.forEach((id, position) => {
      const item = memory.subjects.find(subject => subject.id === id && subject.userId === userId);
      if (item) item.position = position;
    });
  }
  return listSubjects(userId);
}

export async function listPlans(userId) {
  await initStore();
  if (pool) return (await pool.query('SELECT id,subject,topic,study_date AS date,study_time AS time,priority,status FROM study_plans WHERE user_id=$1 ORDER BY created_at DESC', [userId])).rows;
  return memory.plans.filter(plan => plan.userId === userId).map(({ userId, ...plan }) => plan);
}

export async function addPlan(userId, plan) {
  await initStore();
  const item = { id: randomUUID(), ...plan };
  if (pool) await pool.query('INSERT INTO study_plans (id,user_id,subject,topic,study_date,study_time,priority,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [item.id, userId, item.subject, item.topic, item.date, item.time, item.priority, item.status]);
  else memory.plans.unshift({ ...item, userId });
  return item;
}

export async function removePlan(userId, id) {
  await initStore();
  if (pool) return (await pool.query('DELETE FROM study_plans WHERE id=$1 AND user_id=$2', [id, userId])).rowCount > 0;
  const index = memory.plans.findIndex(plan => plan.id === id && plan.userId === userId);
  if (index < 0) return false;
  memory.plans.splice(index, 1);
  return true;
}

export async function saveDiary(userId, entry) {
  await initStore();
  const item = { id: randomUUID(), ...entry };
  if (pool) return (await pool.query(`INSERT INTO diaries (id,user_id,subject,lesson_date,planned,actual,reached,understood,doubts,notes,references_text)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT (user_id,subject,lesson_date) DO UPDATE SET planned=$5,actual=$6,reached=$7,understood=$8,doubts=$9,notes=$10,references_text=$11,updated_at=NOW()
    RETURNING id,subject,lesson_date AS date,planned,actual,reached,understood,doubts,notes,references_text AS references`, [item.id, userId, item.subject, item.date, item.planned, item.actual, item.reached, item.understood, item.doubts, item.notes, item.references])).rows[0];
  const index = memory.diaries.findIndex(diary => diary.userId === userId && diary.subject === item.subject && diary.date === item.date);
  if (index >= 0) memory.diaries[index] = { ...item, userId }; else memory.diaries.unshift({ ...item, userId });
  return item;
}

export async function listDiaries(userId) {
  await initStore();
  if (pool) return (await pool.query('SELECT id,subject,lesson_date AS date,planned,actual,reached,understood,doubts,notes,references_text AS references FROM diaries WHERE user_id=$1 ORDER BY lesson_date DESC', [userId])).rows;
  return memory.diaries.filter(diary => diary.userId === userId).map(({ userId, ...diary }) => diary);
}

export async function listMaterials(userId) {
  await initStore();
  if (pool) return (await pool.query('SELECT id,title,material_type AS type,subject,url,notes FROM study_materials WHERE user_id=$1 ORDER BY created_at DESC', [userId])).rows;
  return memory.materials.filter(material => material.userId === userId).map(({ userId: _userId, ...material }) => material);
}

export async function addMaterial(userId, material) {
  await initStore();
  const item = { id: randomUUID(), ...material };
  if (pool) await pool.query('INSERT INTO study_materials (id,user_id,title,material_type,subject,url,notes) VALUES ($1,$2,$3,$4,$5,$6,$7)', [item.id, userId, item.title, item.type, item.subject, item.url, item.notes]);
  else memory.materials.unshift({ ...item, userId });
  return item;
}

export async function removeMaterial(userId, id) {
  await initStore();
  if (pool) return (await pool.query('DELETE FROM study_materials WHERE id=$1 AND user_id=$2', [id, userId])).rowCount > 0;
  const index = memory.materials.findIndex(material => material.id === id && material.userId === userId);
  if (index < 0) return false;
  memory.materials.splice(index, 1);
  return true;
}

// Exclui a conta e, pelas chaves estrangeiras, todos os registros dela. Exige a senha atual.
export async function deleteUser(userId, password) {
  await initStore();
  const user = pool ? (await pool.query('SELECT * FROM users WHERE id=$1', [userId])).rows[0] : memory.users.find(item => item.id === userId);
  if (!user || !validPassword(password, user.password_salt, user.password_hash)) return false;
  if (pool) {
    await pool.query('DELETE FROM users WHERE id=$1', [userId]);
    return true;
  }
  memory.users = memory.users.filter(item => item.id !== userId);
  for (const [hash, session] of memory.sessions) if (session.userId === userId) memory.sessions.delete(hash);
  for (const key of ['plans', 'diaries', 'materials', 'subjects', 'files']) if (Array.isArray(memory[key])) memory[key] = memory[key].filter(row => row.userId !== userId);
  for (const table of Object.keys(memory.entities || {})) memory.entities[table] = memory.entities[table].filter(row => row.userId !== userId);
  for (const [id, job] of memory.aiJobs || []) if (job.userId === userId) memory.aiJobs.delete(id);
  return true;
}
