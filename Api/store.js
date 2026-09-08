import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import pg from 'pg';

const { Pool } = pg;
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined })
  : null;

const memory = { users: [], sessions: new Map(), plans: [], diaries: [] };
let initialization;

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email, course: user.course || '', institution: user.institution || '', semester: user.semester || '' };
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

export function initStore() {
  if (!pool) return Promise.resolve();
  if (!initialization) initialization = pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      password_hash TEXT NOT NULL, password_salt TEXT NOT NULL,
      course TEXT DEFAULT '', institution TEXT DEFAULT '', semester TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
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
  `);
  return initialization;
}

export async function createUser(input) {
  await initStore();
  const email = input.email.toLowerCase();
  const existing = pool ? (await pool.query('SELECT id FROM users WHERE email=$1', [email])).rowCount : memory.users.some(user => user.email === email);
  if (existing) return null;
  const id = randomUUID();
  const password = passwordRecord(input.password);
  const user = { id, email, name: input.name, password_hash: password.hash, password_salt: password.salt, course: input.course || '', institution: input.institution || '', semester: input.semester || '' };
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
  if (pool) return publicUser((await pool.query('UPDATE users SET name=$2,course=$3,institution=$4,semester=$5 WHERE id=$1 RETURNING *', [userId, changes.name, changes.course, changes.institution, changes.semester])).rows[0]);
  const user = memory.users.find(item => item.id === userId);
  if (!user) return null;
  Object.assign(user, changes);
  return publicUser(user);
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
