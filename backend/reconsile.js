'use strict';

/**
 * reconcile.js
 *
 * Input  → ./input/   (invoices.json, transactions.json, payout_report.csv)
 * Output → ./output/  (created automatically if absent)
 *
 * Phase 1 – invoices_output.json, transactions_output.json
 *            └─ each transaction is enriched with matched_invoice_company
 *               and matched_invoice_id at the individual record level.
 *
 * Phase 2 – invoices_total.json, transactions_total.json
 *            └─ aggregates derived from the already-enriched transactions.
 */

const fs   = require('fs');
const path = require('path');

const INPUT_DIR  = path.join(__dirname, 'input');
const OUTPUT_DIR = path.join(__dirname, 'output');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── helpers ────────────────────────────────────────────────────────────────

function readJson(filename) {
  return JSON.parse(
    fs.readFileSync(path.join(INPUT_DIR, filename), 'utf8')
  );
}

function writePrettyJson(filename, data) {
  fs.writeFileSync(
    path.join(OUTPUT_DIR, filename),
    JSON.stringify(data, null, 2),
    'utf8'
  );
  console.log(`  ✓  output/${filename}  (${data.length} records)`);
}

/**
 * Minimal CSV parser – handles quoted fields and embedded commas.
 * Returns an array of objects keyed by the header row.
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
 * slugify(name)
 * Strip everything except a-z and 0-9, lower-case.
 * "STARK CONSULTING S.A." → "starkconsultingsa"
 * "Acme S.à r.l."         → "acmesarl"
 */
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * extractFirstWord(name)
 * Returns the first word-token lower-cased.
 * "Stark Consulting S.A." → "stark"
 * "GLOBEX S.A."           → "globex"
 */
function extractFirstWord(name) {
  const match = name.match(/[a-zA-Z0-9À-žà-ž]+/);
  return match ? match[0].toLowerCase() : '';
}

// ════════════════════════════════════════════════════════════════════════════
// PHASE 1
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Phase 1 ──────────────────────────────────────────────────');

// ── 1A  Load source data ────────────────────────────────────────────────────
const rawInvoices     = readJson('invoices.json');
const rawTransactions = readJson('transactions.json');
const csvRows         = parseCsv('payout_report.csv');

// ── 1B  Build Invoices array ────────────────────────────────────────────────
//  Keep every entry from invoices.json exactly as structured.
//  Nested line_items stay nested – no flattening.
const invoicesArray = rawInvoices.map(entry => ({
  id:            entry.id,
  type:          entry.type,
  customer_id:   entry.customer_id,
  customer_name: entry.customer_name,
  customer_vat:  entry.customer_vat,
  issue_date:    entry.issue_date,
  due_date:      entry.due_date,
  currency:      entry.currency,
  line_items:    entry.line_items,
  subtotal:      entry.subtotal,
  tax_total:     entry.tax_total,
  total:         entry.total,
  ...(entry.related_invoice
    ? { related_invoice: entry.related_invoice }
    : {}),
}));

// ── 1C  CSV → Invoice object  (last row = payout summary) ──────────────────
const lastCsvRow = csvRows[csvRows.length - 1];
invoicesArray.push({
  id:            lastCsvRow.charge_id,
  type:          lastCsvRow.type,
  customer_name: lastCsvRow.customer_name,
  currency:      'EUR',
  total:         parseFloat(lastCsvRow.net_amount),
  source:        'payout_report.csv',
});

// ── 1D  Build Transactions array ────────────────────────────────────────────
//  Start with every entry from transactions.json.
const transactionsArray = rawTransactions.map(txn => ({ ...txn }));

//  Credit notes → additional transaction objects.
const creditNotes = rawInvoices.filter(e => e.type === 'credit_note');
creditNotes.forEach(cn => {
  transactionsArray.push({
    id:                   cn.id,
    date:                 cn.issue_date,
    amount:               cn.total,
    currency:             cn.currency,
    counterparty_name:    cn.customer_name,
    structured_reference: cn.related_invoice,
    description:          `Credit note ${cn.id} against ${cn.related_invoice}`,
    source:               'credit_note',
  });
});

// ── 1E  Enrich each transaction with invoice match ──────────────────────────
//  For every transaction we run the prefix test against invoicesArray:
//    - slugify the transaction's counterparty_name
//    - find the first invoice whose customer_name first-word is a prefix of it
//  Two fields are added to each transaction object:
//    matched_invoice_id      – the matched invoice's id,            or null
//    matched_invoice_company – the matched invoice's customer_name, or null
//
//  Matching at the individual transaction level means downstream steps can
//  filter/group by match status without re-running the comparison logic.

transactionsArray.forEach(txn => {
  const counterparty = txn.counterparty_name || '';
  const txnSlug = slugify(counterparty);

  const invoiceMatch = invoicesArray.find(inv => {
    if (!inv.customer_name) return false;
    const prefix = extractFirstWord(inv.customer_name);
    return prefix && txnSlug.startsWith(prefix);
  });

  txn.matched_invoice_id      = invoiceMatch ? invoiceMatch.id            : null;
  txn.matched_invoice_company = invoiceMatch ? invoiceMatch.customer_name : null;
});

// Write Phase 1 outputs
writePrettyJson('invoices_output.json',     invoicesArray);
writePrettyJson('transactions_output.json', transactionsArray);


// ════════════════════════════════════════════════════════════════════════════
// PHASE 2
// ════════════════════════════════════════════════════════════════════════════
console.log('\n── Phase 2 ──────────────────────────────────────────────────');

// ── 2A  Aggregate invoice totals per unique company ─────────────────────────
//  Deduplication key = lower-cased first word of customer_name.
//  The invoice-level `total` is the authoritative figure.
//  Credit note totals (negative) are included.

const invoiceTotalMap = new Map(); // firstWord → { customer_name, total_invoiced }

invoicesArray.forEach(inv => {
  const rawName = inv.customer_name;
  if (!rawName) return;

  const key = extractFirstWord(rawName);
  if (!key) return;

  const invTotal = typeof inv.total === 'number' ? inv.total : 0;

  if (!invoiceTotalMap.has(key)) {
    invoiceTotalMap.set(key, { customer_name: rawName, total_invoiced: 0 });
  }
  const entry = invoiceTotalMap.get(key);
  entry.total_invoiced =
    Math.round((entry.total_invoiced + invTotal) * 100) / 100;
});

const invoicesTotalArray = Array.from(invoiceTotalMap.values())
  .sort((a, b) => a.customer_name.localeCompare(b.customer_name));

// ── 2B  Aggregate transaction totals per unique counterparty ─────────────────
//  Deduplication key = lower-cased first word of counterparty_name.
//
//  Because every transaction is already enriched (step 1E), we simply read
//  matched_invoice_company off each record — no second comparison needed.
//  The aggregate also tracks a match_status:
//    "all"     – every transaction in the group matched an invoice
//    "partial" – only some did
//    "none"    – none matched

const txnTotalMap = new Map(); // firstWord → aggregate object

transactionsArray.forEach(txn => {
  const rawName = txn.counterparty_name;
  if (!rawName) return;

  const key = extractFirstWord(rawName);
  if (!key) return;

  const amt = typeof txn.amount === 'number' ? txn.amount : 0;

  if (!txnTotalMap.has(key)) {
    txnTotalMap.set(key, {
      counterparty_name:       rawName,
      total_amount:            0,
      matched_invoice_company: txn.matched_invoice_company, // first seen
      transaction_count:       0,
      matched_count:           0,
    });
  }

  const entry = txnTotalMap.get(key);
  entry.total_amount      = Math.round((entry.total_amount + amt) * 100) / 100;
  entry.transaction_count += 1;
  if (txn.matched_invoice_company !== null) entry.matched_count += 1;

  // Prefer a non-null match if the first record in the group happened to be unmatched
  if (!entry.matched_invoice_company && txn.matched_invoice_company) {
    entry.matched_invoice_company = txn.matched_invoice_company;
  }
});

const transactionsTotalArray = Array.from(txnTotalMap.values())
  .map(entry => ({
    counterparty_name:       entry.counterparty_name,
    total_amount:            entry.total_amount,
    matched_invoice_company: entry.matched_invoice_company,
    match_status:
      entry.matched_count === 0                         ? 'none'
      : entry.matched_count === entry.transaction_count ? 'all'
      :                                                   'partial',
  }))
  .sort((a, b) => a.counterparty_name.localeCompare(b.counterparty_name));

// Write Phase 2 outputs
writePrettyJson('invoices_total.json',     invoicesTotalArray);
writePrettyJson('transactions_total.json', transactionsTotalArray);

console.log('\nDone.\n');