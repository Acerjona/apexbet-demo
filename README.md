# ApexBet Demo

A production-ready sportsbook demo with a PostgreSQL-backed API and static frontend.

## Prerequisites

- Node.js 20+
- PostgreSQL 16+

## Local setup

1. Create a database named `apexbet`.
2. Copy `.env.example` to `.env` and update values.
3. Install dependencies:

```bash
npm install
```

4. Run migrations:

```bash
npm run migrate
```

5. Seed fixtures:

```bash
npm run seed
```

6. Start the server:

```bash
npm start
```

Open http://localhost:3000

## Demo auth

- Email: `demo@apexbet.com`
- Password: `password123`

## Deployment

This app is ready for deployment on services like Render or Railway.

- Use `render.yaml` for Render deployment.
- Ensure PostgreSQL is connected via environment variables.
- For a production deployment, set `JWT_SECRET`, `DB_HOST`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` in the hosting environment.

## Routes

- `GET /api/health`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/me`
- `GET /api/matches`
- `GET /api/bets`
- `POST /api/bets`
- `POST /api/deposit`
