import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'apexbet',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

const initSql = fs.readFileSync(path.join(__dirname, '..', 'db', 'init.sql'), 'utf8');

try {
  await pool.query(initSql);
  console.log('Database initialized.');
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exit(1);
}
