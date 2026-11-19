import { randomUUID } from 'node:crypto';
import { initStore, memory, pool } from './store.js';
import { progressFor } from './notifications.js';

// Loja da Madrugada (versão 4.1): itens só visuais, comprados com Pozinho Mágico.
//
// Regra da moeda (decidida em 18/11/2026):
// - O XP nunca é gasto. Ele continua decidindo nível e ranking; comprar não tira nível de ninguém.
// - O pozinho acompanha o XP ganho DEPOIS da abertura da loja: saldo = boas-vindas + (XP agora - XP na abertura) - gastos.
//   Assim quem já tinha muito XP não compra a loja inteira no primeiro dia, e todo item exige estudo novo.
// - Boas-vindas: 200 para todo mundo, mais 15% do XP que a pessoa já tinha (até +500), para reconhecer quem já estudava.
// - Se o XP cair (penalidade de tarefa, aula apagada), o pozinho cai junto. O saldo mostrado nunca fica negativo,
//   e item comprado nunca é tomado de volta.
// - Preços pensados para o ritmo real (aluno ativo ganha ~100 XP por dia): a moldura mais barata sai em ~5 dias de
//   estudo, a mais cara em ~3 semanas.
export const launchAt = new Date('2026-11-19T03:00:00Z');
export const welcomeBase = 200;
export const welcomeFromPast = xp => Math.min(500, Math.floor(Math.max(0, xp) * 0.15));

export const catalog = [
  { id: 'moldura-lua', kind: 'moldura', name: 'Lua', price: 500, description: 'Luz prateada que respira devagar, com uma lua crescente e partículas sutis.' },
  { id: 'moldura-sereia', kind: 'moldura', name: 'Sereia', price: 600, description: 'Ondas que giram em volta da foto, com bolhas e reflexos de água.' },
  { id: 'moldura-fada', kind: 'moldura', name: 'Fada', price: 650, description: 'Brilhinhos e poeira de luz que piscam ao redor da foto.' },
  { id: 'moldura-sol', kind: 'moldura', name: 'Sol', price: 800, description: 'Raios dourados girando em volta de um anel de luz quente.' },
  { id: 'moldura-eclipse', kind: 'moldura', name: 'Eclipse', price: 1200, description: 'Uma coroa de luz âmbar pulsando atrás de um anel escuro.' },
  { id: 'moldura-constelacao', kind: 'moldura', name: 'Constelação', price: 1800, description: 'Estrelas piscando num anel pontilhado, com uma estrela cadente de vez em quando.' },
  { id: 'cores-aurora', kind: 'cores', name: 'Pacote Aurora', price: 900, description: 'Quatro cores novas para o app além da padrão, combinadas com o fundo do Grimiau para manter o texto fácil de ler.', colors: ['aurora', 'alvorada', 'brasa', 'musgo'] },
];
export const appColors = ['', 'aurora', 'alvorada', 'brasa', 'musgo'];
const byId = new Map(catalog.map(item => [item.id, item]));

let ready;
export function initShop() {
  ready ||= (async () => {
    await initStore();
    if (!pool) {
      memory.shop ||= { wallets: new Map(), purchases: [], settings: new Map() };
      return;
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shop_wallets (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        baseline_xp INTEGER NOT NULL DEFAULT 0, welcome INTEGER NOT NULL DEFAULT 0,
        frame TEXT NOT NULL DEFAULT '', app_color TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS shop_purchases (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL, price INTEGER NOT NULL, created_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE (user_id, item_id));
      CREATE TABLE IF NOT EXISTS shop_item_settings (
        item_id TEXT PRIMARY KEY, price INTEGER, published BOOLEAN NOT NULL DEFAULT TRUE,
        updated_by TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());`);
    // Quem já tinha conta antes da abertura tem a carteira criada agora, com o XP de hoje como ponto de partida.
    const users = (await pool.query(`SELECT u.id FROM users u LEFT JOIN shop_wallets w ON w.user_id=u.id
      WHERE w.user_id IS NULL AND u.created_at < $1`, [launchAt])).rows;
    for (const user of users) await createWallet(user.id, true);
  })().catch(error => {
    ready = null;
    throw error;
  });
  return ready;
}

async function createWallet(userId, existed) {
  const baseline = existed ? (await progressFor(userId)).xp : 0;
  const welcome = welcomeBase + (existed ? welcomeFromPast(baseline) : 0);
  if (pool) {
    await pool.query('INSERT INTO shop_wallets (user_id, baseline_xp, welcome) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING', [userId, baseline, welcome]);
    return;
  }
  if (!memory.shop.wallets.has(userId)) memory.shop.wallets.set(userId, { baselineXp: baseline, welcome, frame: '', appColor: '' });
}

async function walletRow(userId) {
  await initShop();
  const read = async () => pool
    ? (await pool.query('SELECT baseline_xp AS "baselineXp", welcome, frame, app_color AS "appColor" FROM shop_wallets WHERE user_id=$1', [userId])).rows[0]
    : memory.shop.wallets.get(userId);
  let row = await read();
  if (!row) {
    const created = pool ? (await pool.query('SELECT created_at FROM users WHERE id=$1', [userId])).rows[0]?.created_at : null;
    await createWallet(userId, Boolean(created && new Date(created) < launchAt));
    row = await read();
  }
  return row;
}

async function settings() {
  await initShop();
  if (!pool) return memory.shop.settings;
  return new Map((await pool.query('SELECT item_id AS "itemId", price, published FROM shop_item_settings')).rows.map(row => [row.itemId, row]));
}

// Catálogo com preço e publicação ajustados pela administração (o visual de cada item vive no código).
export async function shopItems() {
  const saved = await settings();
  return catalog.map(item => {
    const custom = saved.get(item.id) || {};
    return { ...item, price: Number.isInteger(custom.price) ? custom.price : item.price, published: custom.published !== false };
  });
}

async function purchasesOf(userId, client = pool) {
  if (!pool) return memory.shop.purchases.filter(item => item.userId === userId);
  return (await client.query('SELECT item_id AS "itemId", price FROM shop_purchases WHERE user_id=$1', [userId])).rows;
}

export async function walletOf(userId) {
  const [row, { xp }, purchases] = await Promise.all([walletRow(userId), progressFor(userId), (async () => { await initShop(); return purchasesOf(userId); })()]);
  const earned = row.welcome + xp - row.baselineXp;
  const spent = purchases.reduce((sum, item) => sum + item.price, 0);
  return { balance: Math.max(0, earned - spent), earned: Math.max(0, earned), spent, xp, owned: purchases.map(item => item.itemId), frame: row.frame, appColor: row.appColor };
}

export async function buy(userId, itemId) {
  const item = (await shopItems()).find(entry => entry.id === itemId);
  if (!item || !item.published) return { status: 404, error: 'Este item não está à venda.' };
  const row = await walletRow(userId);
  const { xp } = await progressFor(userId);
  const earned = row.welcome + xp - row.baselineXp;
  if (!pool) {
    const owned = memory.shop.purchases.filter(entry => entry.userId === userId);
    if (owned.some(entry => entry.itemId === itemId)) return { status: 409, error: 'Você já tem este item.' };
    const balance = earned - owned.reduce((sum, entry) => sum + entry.price, 0);
    if (balance < item.price) return { status: 400, error: `Faltam ${item.price - Math.max(0, balance)} de pozinho.` };
    memory.shop.purchases.push({ id: randomUUID(), userId, itemId, price: item.price });
    return { status: 201 };
  }
  // Trava a carteira para duas compras ao mesmo tempo não gastarem o mesmo pozinho.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT 1 FROM shop_wallets WHERE user_id=$1 FOR UPDATE', [userId]);
    const owned = await purchasesOf(userId, client);
    if (owned.some(entry => entry.itemId === itemId)) {
      await client.query('ROLLBACK');
      return { status: 409, error: 'Você já tem este item.' };
    }
    const balance = earned - owned.reduce((sum, entry) => sum + entry.price, 0);
    if (balance < item.price) {
      await client.query('ROLLBACK');
      return { status: 400, error: `Faltam ${item.price - Math.max(0, balance)} de pozinho.` };
    }
    await client.query('INSERT INTO shop_purchases (id,user_id,item_id,price) VALUES ($1,$2,$3,$4)', [randomUUID(), userId, itemId, item.price]);
    await client.query('COMMIT');
    return { status: 201 };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function saveEquip(userId, changes) {
  await walletRow(userId);
  if (pool) {
    if ('frame' in changes) await pool.query('UPDATE shop_wallets SET frame=$2 WHERE user_id=$1', [userId, changes.frame]);
    if ('appColor' in changes) await pool.query('UPDATE shop_wallets SET app_color=$2 WHERE user_id=$1', [userId, changes.appColor]);
    return;
  }
  Object.assign(memory.shop.wallets.get(userId), changes);
}

// Molduras equipadas de várias pessoas de uma vez (para mostrar em toda foto, sem uma chamada por avatar).
export async function framesOf(userIds) {
  await initShop();
  const ids = [...new Set(userIds)].filter(Boolean).slice(0, 200);
  if (!ids.length) return {};
  const rows = pool
    ? (await pool.query(`SELECT user_id AS "userId", frame FROM shop_wallets WHERE user_id = ANY($1) AND frame <> ''`, [ids])).rows
    : ids.map(userId => ({ userId, frame: memory.shop.wallets.get(userId)?.frame || '' })).filter(row => row.frame);
  return Object.fromEntries(rows.map(row => [row.userId, row.frame.replace(/^moldura-/, '')]));
}

export async function setItemSettings(itemId, { price, published }, adminId) {
  if (!byId.has(itemId)) return false;
  const current = (await settings()).get(itemId) || {};
  const next = {
    price: price === undefined ? (current.price ?? null) : price,
    published: published === undefined ? current.published !== false : Boolean(published),
  };
  if (pool) {
    await pool.query(`INSERT INTO shop_item_settings (item_id, price, published, updated_by, updated_at) VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (item_id) DO UPDATE SET price=$2, published=$3, updated_by=$4, updated_at=NOW()`, [itemId, next.price, next.published, adminId]);
  } else memory.shop.settings.set(itemId, { itemId, ...next });
  return true;
}

export async function shopStats() {
  const items = await shopItems();
  await initShop();
  const sales = pool
    ? (await pool.query('SELECT item_id AS "itemId", count(*)::int AS count FROM shop_purchases GROUP BY item_id')).rows
    : Object.entries(memory.shop.purchases.reduce((acc, row) => ({ ...acc, [row.itemId]: (acc[row.itemId] || 0) + 1 }), {})).map(([itemId, count]) => ({ itemId, count }));
  const count = new Map(sales.map(row => [row.itemId, row.count]));
  return items.map(item => ({ ...item, sold: count.get(item.id) || 0 }));
}

export function registerShopRoutes(app, requireAuth) {
  app.get('/api/v1/loja', requireAuth, async (req, res, next) => {
    try {
      const [items, wallet] = await Promise.all([shopItems(), walletOf(req.user.id)]);
      return res.json({ wallet, items: items.filter(item => item.published || wallet.owned.includes(item.id)) });
    } catch (error) {
      return next(error);
    }
  });

  app.post('/api/v1/loja/:itemId/comprar', requireAuth, async (req, res, next) => {
    try {
      const result = await buy(req.user.id, req.params.itemId);
      if (result.error) return res.status(result.status).json({ error: result.error });
      return res.status(201).json({ wallet: await walletOf(req.user.id) });
    } catch (error) {
      return next(error);
    }
  });

  // Equipar: moldura ('' tira) e cor do app ('' volta à padrão). Só vale item comprado.
  app.put('/api/v1/loja/equipar', requireAuth, async (req, res, next) => {
    try {
      const wallet = await walletOf(req.user.id);
      const changes = {};
      if (req.body?.frame !== undefined) {
        const frame = String(req.body.frame || '');
        if (frame && (!byId.get(frame) || byId.get(frame).kind !== 'moldura' || !wallet.owned.includes(frame))) return res.status(403).json({ error: 'Compre esta moldura antes de usar.' });
        changes.frame = frame;
      }
      if (req.body?.appColor !== undefined) {
        const color = String(req.body.appColor || '');
        if (!appColors.includes(color)) return res.status(400).json({ error: 'Cor desconhecida.' });
        if (color && !wallet.owned.includes('cores-aurora')) return res.status(403).json({ error: 'Compre o Pacote Aurora para usar esta cor.' });
        changes.appColor = color;
      }
      await saveEquip(req.user.id, changes);
      return res.json({ wallet: await walletOf(req.user.id) });
    } catch (error) {
      return next(error);
    }
  });

  app.get('/api/v1/loja/molduras', requireAuth, async (req, res, next) => {
    try {
      return res.json(await framesOf(String(req.query.ids || '').split(',').map(id => id.trim()).slice(0, 200)));
    } catch (error) {
      return next(error);
    }
  });
}
