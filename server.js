import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'apexbet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, displayName: user.display_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

async function ensureDemoUser() {
  const result = await pool.query('SELECT id FROM users WHERE email = $1', ['demo@apexbet.com']);

  if (result.rowCount > 0) return;

  const passwordHash = await bcrypt.hash('password123', 10);
  await pool.query(
    `
      INSERT INTO users (email, password_hash, display_name, balance_cents)
      VALUES ($1, $2, $3, $4)
    `,
    ['demo@apexbet.com', passwordHash, 'Demo User', 142050]
  );
}

async function loadFixtures() {
  const result = await pool.query(`
    SELECT m.*,
      json_agg(
        json_build_object(
          'id', mk.id,
          'label', mk.label,
          'odds', mk.odds,
          'outcome_name', mk.outcome_name
        )
        ORDER BY mk.id
      ) AS markets
    FROM matches m
    LEFT JOIN markets mk ON mk.match_id = m.id
    GROUP BY m.id
    ORDER BY m.start_time ASC
  `);

  return result.rows.map((row) => ({
    ...row,
    markets: row.markets || [],
  }));
}

app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as now');
    res.json({ ok: true, timestamp: result.rows[0].now });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const { email, password, displayName } = req.body;

  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Email, password and display name are required.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `
        INSERT INTO users (email, password_hash, display_name, balance_cents)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, display_name, balance_cents
      `,
      [email, passwordHash, displayName, 100000]
    );

    const user = result.rows[0];
    return res.status(201).json({
      token: signToken(user),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        balanceCents: user.balance_cents,
      },
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Email already exists.' });
    }
    return res.status(500).json({ error: 'Registration failed.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    return res.json({
      token: signToken(user),
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        balanceCents: user.balance_cents,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/me', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        balanceCents: user.balance_cents,
      },
    });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.get('/api/matches', async (_req, res) => {
  try {
    const fixtures = await loadFixtures();
    return res.json({ fixtures });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get('/api/bets', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await pool.query(
      `
        SELECT b.*, m.home_team, m.away_team
        FROM bets b
        JOIN matches m ON m.id = b.match_id
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC
      `,
      [decoded.id]
    );

    return res.json({ bets: result.rows });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.post('/api/bets', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { marketId, stakeCents } = req.body;
    if (!marketId || !Number.isFinite(Number(stakeCents)) || Number(stakeCents) <= 0) {
      return res.status(400).json({ error: 'Valid market and stake are required.' });
    }

    const marketResult = await pool.query(
      `
        SELECT mk.*, m.home_team, m.away_team
        FROM markets mk
        JOIN matches m ON m.id = mk.match_id
        WHERE mk.id = $1
      `,
      [marketId]
    );

    if (marketResult.rowCount === 0) {
      return res.status(404).json({ error: 'Market not found.' });
    }

    const market = marketResult.rows[0];
    const stake = Number(stakeCents);
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [decoded.id]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (stake > user.balance_cents) {
      return res.status(400).json({ error: 'Insufficient balance.' });
    }

    const odds = Number(market.odds);
    const potentialPayoutCents = Math.round(stake * odds);

    const betResult = await pool.query(
      `
        INSERT INTO bets (
          user_id, match_id, market_id, outcome_name, selected_label, odds, stake_cents, potential_payout_cents, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
        RETURNING *
      `,
      [user.id, market.match_id, market.id, market.outcome_name, market.label, odds, stake, potentialPayoutCents]
    );

    await pool.query(
      'UPDATE users SET balance_cents = balance_cents - $1 WHERE id = $2',
      [stake, user.id]
    );

    await pool.query(
      `
        INSERT INTO transactions (user_id, type, amount_cents, note)
        VALUES ($1, 'bet', $2, $3)
      `,
      [user.id, -stake, `Bet on ${market.home_team} vs ${market.away_team}`]
    );

    return res.status(201).json({ message: 'Bet placed successfully.', bet: betResult.rows[0] });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.post('/api/deposit', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const { amountCents } = req.body;

    if (!Number.isFinite(Number(amountCents)) || Number(amountCents) <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const amount = Number(amountCents);
    const result = await pool.query(
      `
        UPDATE users
        SET balance_cents = balance_cents + $1
        WHERE id = $2
        RETURNING balance_cents
      `,
      [amount, decoded.id]
    );

    await pool.query(
      `
        INSERT INTO transactions (user_id, type, amount_cents, note)
        VALUES ($1, 'deposit', $2, $3)
      `,
      [decoded.id, amount, 'Demo wallet deposit']
    );

    return res.json({ message: 'Deposit successful', balanceCents: result.rows[0].balance_cents });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
  try {
    await ensureDemoUser();
    app.listen(port, () => {
      console.log(`ApexBet server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();
