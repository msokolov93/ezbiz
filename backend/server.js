'use strict';

const Fastify = require('fastify');
const { Pool } = require('pg');
const { main: runIngestion } = require('./injest');

const app = Fastify({ logger: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok' }));

// ── Graceful shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  await app.close();
  await pool.end();
  process.exit(0);
});

// ── Startup ───────────────────────────────────────────────────────────────────
async function start() {
  console.log('\nRunning data ingestion...');
  await runIngestion();
  console.log('Ingestion complete. Starting server...\n');

  await app.listen({ port: 3000, host: '0.0.0.0' });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});
