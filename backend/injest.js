'use strict';

/**
 * reconcile.js
 *
 * Reads source data from ./input/ (invoices.json, transactions.json, payout_report.csv),
 * populates PostgreSQL tables (customers, invoices, invoice_line_items, users),
 * and writes ./output/access.json with the generated default user credentials.
 *
 * Required env vars (set in .env or environment):
 *   DATABASE_URL      – postgres://user:pass@host:5432/dbname
 *   DEFAULT_USERNAME  – username for the seeded user  (default: "user")
 *   DEFAULT_EMAIL     – email for the seeded user      (default: "user@localhost")
 *   DEFAULT_ROLE      – role for the seeded user       (default: "viewer")
 *
 * Required npm packages:
 *   pg, bcrypt, dotenv
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs     = require('fs');
const path   = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const INPUT_DIR  = path.join(__dirname, 'input');
const OUTPUT_DIR = path.join(__dirname, 'output');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── DB pool ─────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Logs every write (INSERT/UPDATE/DELETE) with table name and row count.
async function loggedQuery(client, sql, params) {
  const match = sql.match(/^\s*(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i);
  if (match) {
    const [, op, table] = match;
    const start = Date.now();
    try {
      const result = await client.query(sql, params);
      console.log(`[DB] ${op.replace(/\s+/g, ' ').toUpperCase()} ${table} — ${result.rowCount} row(s) affected (${Date.now() - start}ms)`);
      return result;
    } catch (err) {
      console.error(`[DB] ${op.replace(/\s+/g, ' ').toUpperCase()} ${table} — ERROR: ${err.message}`);
      throw err;
    }
  }
  return client.query(sql, params);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(INPUT_DIR, filename), 'utf8'));
}

/**
 * Minimal CSV parser – handles quoted fields and embedded commas.
 */
function parseCsv(filename) {
  const raw   = fs.readFileSync(path.join(INPUT_DIR, filename), 'utf8');
  const lines = raw.trim().split(/\r?\n/);

  function splitLine(line) {
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if      (ch === '"' && !inQ) { inQ = true; }
      else if (ch === '"' &&  inQ) { inQ = false; }
      else if (ch === ',' && !inQ) { fields.push(cur); cur = ''; }
      else                         { cur += ch; }
    }
    fields.push(cur);
    return fields;
  }

  const headers = splitLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = splitLine(line);
    const obj  = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] ?? '').trim(); });
    return obj;
  });
}

/**
 * Generates a random alphanumeric password of the given length.
 */
function generatePassword(length = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars[Math.floor(Math.random() * chars.length)];
  }
  return password;
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();

  try {
    // ── Load source data ──────────────────────────────────────────────────────
    const rawInvoices = readJson('invoices.json');
    const csvRows     = parseCsv('payout_report.csv');

    // ── Extract credit notes → synthetic transactions ─────────────────────────
    const creditNoteTransactions = rawInvoices
      .filter(entry => entry.type === 'credit_note')
      .map(cn => ({
        id:                   cn.id,
        date:                 cn.issue_date,
        amount:               Math.abs(cn.total),
        currency:             cn.currency ?? 'EUR',
        description:          cn.line_items?.[0]?.line_id ?? cn.id,
        customer_name:        cn.customer_name ?? null,
        counterparty_name:    cn.customer_name ?? null,
        structured_reference: cn.related_invoice ?? null,
      }));

    // ── Build invoices array (credit notes excluded) ──────────────────────────
    const invoicesArray = rawInvoices.filter(entry => entry.type !== 'credit_note').map(entry => ({
      id:            entry.id,
      type:          entry.type,
      customer_id:   entry.customer_id   ?? null,
      customer_name: entry.customer_name ?? null,
      customer_vat:  entry.customer_vat  ?? null,
      issue_date:    entry.issue_date    ?? null,
      due_date:      entry.due_date      ?? null,
      currency:      entry.currency      ?? 'EUR',
      line_items:    entry.line_items    ?? [],
      subtotal:      entry.subtotal      ?? null,
      tax_total:     entry.tax_total     ?? null,
      total:         entry.total         ?? null,
    }));

    // Append payout summary row from CSV
    const lastCsvRow = csvRows[csvRows.length - 1];
    invoicesArray.push({
      id:            lastCsvRow.charge_id,
      type:          lastCsvRow.type,
      customer_id:   null,
      customer_name: lastCsvRow.customer_name,
      customer_vat:  null,
      issue_date:    null,
      due_date:      null,
      currency:      'EUR',
      line_items:    [],
      subtotal:      null,
      tax_total:     null,
      total:         parseFloat(lastCsvRow.net_amount),
      source:        'payout_report.csv',
    });

    await client.query('BEGIN');

    // ── 1. Upsert customers ───────────────────────────────────────────────────
    console.log('\n── Inserting customers ──────────────────────────────────────');

    const customersSeen = new Map();

    for (const inv of invoicesArray) {
      if (!inv.customer_id || customersSeen.has(inv.customer_id)) continue;

      await loggedQuery(
        client,
        `INSERT INTO customers (customer_id, name, vat_number)
         VALUES ($1, $2, $3)
         ON CONFLICT (customer_id) DO NOTHING`,
        [inv.customer_id, inv.customer_name, inv.customer_vat]
      );

      customersSeen.set(inv.customer_id, true);
      console.log(`  ✓  customer  ${inv.customer_id}  (${inv.customer_name})`);
    }

    // ── 2. Insert invoices ────────────────────────────────────────────────────
    console.log('\n── Inserting invoices ───────────────────────────────────────');

    for (const inv of invoicesArray) {
      await loggedQuery(
        client,
        `INSERT INTO invoices
           (id, type, customer_id, issue_date, due_date, currency,
            subtotal, tax_total, total, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id) DO NOTHING`,
        [
          inv.id,
          inv.type,
          inv.customer_id  ?? null,
          inv.issue_date   ?? null,
          inv.due_date     ?? null,
          inv.currency,
          inv.subtotal     ?? null,
          inv.tax_total    ?? null,
          inv.total,
          inv.source       ?? null,
        ]
      );
      console.log(`  ✓  invoice  ${inv.id}`);
    }

    // ── 3. Insert transactions ────────────────────────────────────────────────
    console.log('\n── Inserting transactions ───────────────────────────────────');

    const transactionsData = [
      ...JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'transactions.json'), 'utf8')),
      ...creditNoteTransactions,
    ];

    for (const trx of transactionsData) {
      await loggedQuery(
        client,
        `INSERT INTO transactions (id, transaction_date, amount, currency, description, customer_name, counterparty_name, structured_reference, unapplied_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [trx.id, trx.date, trx.amount, trx.currency, trx.description, trx.customer_name ?? null, trx.counterparty_name ?? null, trx.structured_reference ?? null, trx.amount]
      );
      console.log(`  ✓  transaction  ${trx.id}`);
    }

    // ── 4. Create default user ────────────────────────────────────────────────
    console.log('\n── Creating default user ────────────────────────────────────');

    const plainPassword  = generatePassword();
    const password_hash  = await bcrypt.hash(plainPassword, 12);

    const defaultUsername = process.env.FRONT_USER  || 'user';
    const defaultEmail    = process.env.FRONT_EMAIL || 'user@localhost';
    const defaultRole     = process.env.FRONT_ROLE  || 'viewer';

    await loggedQuery(
      client,
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      [defaultUsername, defaultEmail, password_hash, defaultRole]
    );

    console.log(`  ✓  user  "${defaultUsername}"  created`);

    await client.query('COMMIT');  // single commit covers all inserts above

    // ── 5. Write access.json ──────────────────────────────────────────────────
    const accessData = {
      username: defaultUsername,
      password: plainPassword,
      note:     'This file is generated once. Store the password somewhere safe and delete this file.',
    };

    fs.writeFileSync(
      path.join(OUTPUT_DIR, 'access.json'),
      JSON.stringify(accessData, null, 2),
      'utf8'
    );

    console.log('\n  ✓  output/access.json  written');

    // ── 6. Delete input files ─────────────────────────────────────────────────
    const inputFiles = ['invoices.json', 'payout_report.csv', 'transactions.json'];
    for (const file of inputFiles) {
      const filePath = path.join(INPUT_DIR, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`  ✓  deleted  input/${file}`);
      }
    }

    console.log('\nDone.\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\nError – transaction rolled back:\n', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) main();

module.exports = { main };