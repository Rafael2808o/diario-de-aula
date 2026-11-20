import request from 'supertest';
import app from '../app.js';

// Conta nova para cada teste (e-mail único, para rodar várias vezes no mesmo banco).
export const account = async (name, extra = {}) => {
  const email = `${name.replace(/\W/g, '').toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@grimiau.local`;
  const response = await request(app).post('/api/v1/auth/register').send({ name, email, password: 'senha-segura-123' });
  const auth = { Authorization: `Bearer ${response.body.token}` };
  if (Object.keys(extra).length) await request(app).patch('/api/v1/me').set(auth).send(extra);
  return { user: response.body.user, auth };
};
