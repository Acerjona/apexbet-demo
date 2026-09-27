import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'apexbet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const fixtures = [
  {
    slug: 'arsenal-vs-chelsea',
    league: 'Premier League',
    start_time: '2026-10-05T18:00:00Z',
    home_team: 'Arsenal',
    away_team: 'Chelsea',
    status: 'scheduled',
    markets: [
      { label: '1', odds: 1.45, outcome_name: 'Arsenal' },
      { label: 'X', odds: 4.2, outcome_name: 'Draw' },
      { label: '2', odds: 7.5, outcome_name: 'Chelsea' },
    ],
  },
  {
    slug: 'man-city-vs-liverpool',
    league: 'Premier League',
    start_time: '2026-10-05T20:00:00Z',
    home_team: 'Manchester City',
    away_team: 'Liverpool',
    status: 'scheduled',
    markets: [
      { label: '1', odds: 2.1, outcome_name: 'Manchester City' },
      { label: 'X', odds: 3.5, outcome_name: 'Draw' },
      { label: '2', odds: 3.2, outcome_name: 'Liverpool' },
    ],
  },
  {
    slug: 'barcelona-vs-real-madrid',
    league: 'La Liga',
    start_time: '2026-10-06T21:00:00Z',
    home_team: 'Barcelona',
    away_team: 'Real Madrid',
    status: 'scheduled',
    markets: [
      { label: '1', odds: 2.35, outcome_name: 'Barcelona' },
      { label: 'X', odds: 3.8, outcome_name: 'Draw' },
      { label: '2', odds: 2.9, outcome_name: 'Real Madrid' },
    ],
  },
];

const insertFixture = async (fixture) => {
  const matchResult = await pool.query(
    `
      INSERT INTO matches (slug, league, start_time, home_team, away_team, status)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (slug) DO NOTHING
      RETURNING id
    `,
    [fixture.slug, fixture.league, fixture.start_time, fixture.home_team, fixture.away_team, fixture.status]
  );

  const matchId =
    matchResult.rows[0]?.id ||
    (await pool.query('SELECT id FROM matches WHERE slug = $1', [fixture.slug])).rows[0].id;

  for (const market of fixture.markets) {
    await pool.query(
      `
        INSERT INTO markets (match_id, label, odds, outcome_name)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
      `,
      [matchId, market.label, market.odds, market.outcome_name]
    );
  }
};

try {
  for (const fixture of fixtures) {
    await insertFixture(fixture);
  }

  console.log('Seed data inserted.');
  process.exit(0);
} catch (error) {
  console.error('Seed failed:', error.message);
  process.exit(1);
}
