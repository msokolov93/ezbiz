'use strict';

const Fastify = require('fastify');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { main: runIngestion } = require('./injest');

const app = Fastify({ logger: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const JWT_SECRET = process.env.JWT_SECRET;
const UNPROTECTED = new Set(['/health', '/api/auth/login']);

const ROLE_RANK = { viewer: 1, admin: 2 };

function requireRole(minRole) {
  return async (request, reply) => {
    const userRank = ROLE_RANK[request.user?.role] ?? 0;
    if (userRank < (ROLE_RANK[minRole] ?? 99)) {
      return reply.status(403).send({ error: `Requires ${minRole} role or above` });
    }
  };
}

// ── Auth middleware ───────────────────────────────────────────────────────────
app.addHook('onRequest', async (request, reply) => {
  if (UNPROTECTED.has(request.url)) return;
  const auth = request.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
  try {
    request.user = jwt.verify(auth.slice(7), JWT_SECRET);
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired token' });
  }
});

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async () => ({ status: 'ok' }));

// ── API: Login ────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (request, reply) => {
  const { username, password } = request.body;
  if (!username || !password) {
    return reply.status(400).send({ error: 'Username and password required' });
  }
  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return reply.status(401).send({ error: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    return { token, username: user.username, role: user.role };
  } catch (err) {
    app.log.error(err);
    return reply.status(500).send({ error: 'Login failed' });
  }
});

// ── API: Manual Reconciliation ───────────────────────────────────────────────
// This endpoint receives the JSON payload from the React swiper dashboard
app.post('/api/reconcile', { preHandler: requireRole('admin') }, async (request, reply) => {
  const { invoice_id, transaction_id, amount } = request.body;
  
  if (!invoice_id || !transaction_id || amount === undefined) {
    return reply.status(400).send({ error: 'Missing required fields: invoice_id, transaction_id, amount' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Create the many-to-many reconciliation record
    await client.query(
      `INSERT INTO reconciliations (invoice_id, transaction_id, amount_applied)
       VALUES ($1, $2, $3)`,
      [invoice_id, transaction_id, amount]
    );

    // 2. Reduce the transaction's unapplied amount and update its status
    await client.query(
      `UPDATE transactions 
       SET unapplied_amount = unapplied_amount - $1,
           status = CASE WHEN unapplied_amount - $1 <= 0 THEN 'reconciled' ELSE 'partial' END
       WHERE id = $2`,
      [amount, transaction_id]
    );

    // 3. Update the invoice status based on total payments received
    await client.query(
      `UPDATE invoices 
       SET status = CASE 
                      WHEN (SELECT COALESCE(SUM(amount_applied), 0) FROM reconciliations WHERE invoice_id = $1) >= total THEN 'paid' 
                      ELSE 'partially_paid' 
                    END
       WHERE id = $1`,
      [invoice_id]
    );

    await client.query('COMMIT'); // Crucial: Save the state
    return { success: true, message: 'Successfully reconciled' };
    
  } catch (err) {
    await client.query('ROLLBACK'); // Discard if anything goes wrong
    app.log.error(err);
    return reply.status(500).send({ error: 'Database error during reconciliation' });
  } finally {
    client.release();
  }
});

// ── API: Full Invoice Details ─────────────────────────────────────────────────
app.get('/api/invoices/:id', async (request, reply) => {
  const { id } = request.params;

  try {
    const result = await pool.query(
      `SELECT
         i.id,
         i.type,
         i.customer_id,
         c.name AS customer_name,
         i.related_invoice_id,
         i.issue_date,
         i.due_date,
         i.currency,
         i.subtotal,
         i.tax_total,
         i.total,
         i.source,
         i.status,
         COALESCE(SUM(r.amount_applied), 0) AS amount_paid
       FROM invoices i
       LEFT JOIN customers c ON i.customer_id = c.customer_id
       LEFT JOIN reconciliations r ON i.id = r.invoice_id
       WHERE i.id = $1
       GROUP BY i.id, c.name`,
      [id]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    return result.rows[0];
  } catch (err) {
    app.log.error(err);
    return reply.status(500).send({ error: 'Database error fetching invoice' });
  }
});

// ── API: Verify Specific Invoice Status ──────────────────────────────────────
// Returns the current status and exact amount paid towards a specific invoice
app.get('/api/invoices/:id/status', async (request, reply) => {
  const { id } = request.params;

  try {
    const result = await pool.query(
      `SELECT 
         i.id, 
         i.status, 
         i.total, 
         COALESCE(SUM(r.amount_applied), 0) AS amount_paid
       FROM invoices i
       LEFT JOIN reconciliations r ON i.id = r.invoice_id
       WHERE i.id = $1
       GROUP BY i.id`,
      [id]
    );

    if (result.rows.length === 0) {
      return reply.status(404).send({ error: 'Invoice not found' });
    }

    const invoice = result.rows[0];
    return {
      invoice_id: invoice.id,
      is_fully_reconciled: invoice.status === 'paid',
      status: invoice.status,
      total: parseFloat(invoice.total),
      amount_paid: parseFloat(invoice.amount_paid)
    };
  } catch (err) {
    app.log.error(err);
    return reply.status(500).send({ error: 'Database error fetching invoice status' });
  }
});

// ── API: Full Reconciliation Dashboard Report ────────────────────────────────
// Feeds the React Dashboard tables and Tinder-swiper with real-time data
app.get('/api/dashboard-report', async (request, reply) => {
  try {
    // 1. Reconciled Invoices
    const reconciledInvoicesQuery = pool.query(
      `SELECT
         i.id,
         i.customer_id,
         c.name AS customer_name,
         i.total,
         SUM(r.amount_applied) AS amount_paid
       FROM invoices i
       JOIN reconciliations r ON i.id = r.invoice_id
       LEFT JOIN customers c ON i.customer_id = c.customer_id
       WHERE i.status = 'paid'
       GROUP BY i.id, c.name`
    );

    // 2. Unreconciled Invoices
    const unreconciledInvoicesQuery = pool.query(
      `SELECT
         i.id,
         i.customer_id,
         c.name AS customer_name,
         i.total,
         i.status,
         (i.total - COALESCE(SUM(r.amount_applied), 0)) AS remaining_balance
       FROM invoices i
       LEFT JOIN reconciliations r ON i.id = r.invoice_id
       LEFT JOIN customers c ON i.customer_id = c.customer_id
       WHERE i.status != 'paid'
       GROUP BY i.id, c.name`
    );

    // 3. Transactions needing reconciliation
    const pendingTransactionsQuery = pool.query(
      `SELECT
         id,
         transaction_date,
         amount,
         unapplied_amount,
         description,
         customer_name,
         counterparty_name,
         structured_reference
       FROM transactions
       WHERE unapplied_amount > 0
       ORDER BY transaction_date DESC`
    );

    // Run all three concurrently
    const [reconciled, unreconciled, transactions] = await Promise.all([
      reconciledInvoicesQuery,
      unreconciledInvoicesQuery,
      pendingTransactionsQuery
    ]);

    return {
      reconciled_invoices: reconciled.rows,
      unreconciled_invoices: unreconciled.rows,
      pending_transactions: transactions.rows
    };

  } catch (err) {
    app.log.error(err);
    return reply.status(500).send({ error: 'Database error generating report' });
  }
});

// ── Auto-Reconciliation Engine (Backend Script) ──────────────────────────────
async function autoReconcileExactMatches() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    const matchQuery = `
      DO $$
      DECLARE
        match_record RECORD;
        apply_amount NUMERIC;
      BEGIN
        FOR match_record IN
          SELECT t.id AS transaction_id, i.id AS invoice_id, t.unapplied_amount, i.total
          FROM transactions t
          JOIN invoices i ON t.structured_reference = i.id
                          OR t.description LIKE '%' || i.id || '%'
                          OR t.customer_name ILIKE i.customer_id
          WHERE t.unapplied_amount > 0 AND i.status != 'paid'
        LOOP
          apply_amount := LEAST(match_record.unapplied_amount, match_record.total);

          IF apply_amount > 0 THEN
            INSERT INTO reconciliations (invoice_id, transaction_id, amount_applied)
            VALUES (match_record.invoice_id, match_record.transaction_id, apply_amount)
            ON CONFLICT DO NOTHING;

            UPDATE transactions 
            SET unapplied_amount = unapplied_amount - apply_amount,
                status = CASE WHEN unapplied_amount - apply_amount <= 0 THEN 'reconciled' ELSE 'partial' END
            WHERE id = match_record.transaction_id;

            UPDATE invoices 
            SET status = CASE 
                           WHEN (SELECT COALESCE(SUM(amount_applied), 0) FROM reconciliations WHERE invoice_id = match_record.invoice_id) >= total THEN 'paid' 
                           ELSE 'partially_paid' 
                         END
            WHERE id = match_record.invoice_id;
          END IF;
        END LOOP;
      END $$;
    `;
    
    await client.query(matchQuery);
    await client.query('COMMIT');
    console.log('  ✓  Auto-reconciliation engine finished processing exact matches.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('  ✗  Auto-reconciliation failed:', err);
  } finally {
    client.release();
  }
}

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
  
  console.log('Ingestion complete. Starting auto-reconciliation engine...');
  await autoReconcileExactMatches();
  
  console.log('Starting Fastify API server...\n');
  await app.listen({ port: 3000, host: '0.0.0.0' });
}

start().catch(err => {
  console.error(err);
  process.exit(1);
});