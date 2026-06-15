const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST || 'localhost',
  port: process.env.DATABASE_URL ? undefined : process.env.DB_PORT || 5432,
  user: process.env.DATABASE_URL ? undefined : process.env.DB_USER || 'postgres',
  password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD || 'postgres',
  database: process.env.DATABASE_URL ? undefined : process.env.DB_NAME || 'tech_it_world_crm',
  ssl: isProduction ? { rejectUnauthorized: false } : false,
});

pool.on('connect', () => {
  console.log('PostgreSQL database pool connected successfully');
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
