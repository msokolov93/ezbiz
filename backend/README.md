# Backend

Fastify REST API written in Node.js. On startup it runs the ingestion pipeline, then auto-reconciles obvious matches, then begins serving API requests.

## Ingestion — `injest.js`

Reads source files from `backend/input/` and populates the database in a single transaction:

1. **Customers** — extracted from `invoices.json` and upserted into the `customers` table
2. **Credit notes** — invoices with `type: credit_note` are intercepted before the invoice loop, converted into synthetic transactions (absolute amount, `structured_reference` set to the related invoice ID, `description` set to the line item ID), and merged into the transaction batch
3. **Invoices** — all non-credit-note entries from `invoices.json` plus a summary row from `payout_report.csv` are inserted into `invoices`
4. **Transactions** — rows from `transactions.json` plus the synthetic credit-note transactions are inserted into `transactions`
5. **Default user** — a single user is created from `FRONT_USER` / `FRONT_EMAIL` / `FRONT_ROLE` environment variables with a randomly generated password; credentials are written to `backend/output/access.json`

Input files are deleted after successful ingestion so they are not re-processed on restart.

## API — `server.js`

All endpoints except `/health` and `/api/auth/login` require a valid JWT in the `Authorization: Bearer <token>` header.

Role hierarchy: `viewer` (read-only) < `admin` (read + write).

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | None | Accepts `{ username, password }`, returns a signed JWT valid for 8 hours |

### Invoices

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/invoices/:id` | viewer | Full invoice row joined with customer name and current amount paid |
| `GET` | `/api/invoices/:id/status` | viewer | Lightweight status check: `is_fully_reconciled`, `status`, `total`, `amount_paid` |

### Dashboard

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/dashboard-report` | viewer | Returns three lists in one call: reconciled invoices, unreconciled invoices, and pending transactions (those with `unapplied_amount > 0`) |

### Reconciliation

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/reconcile` | admin | Applies `amount` from a transaction to an invoice. Updates `reconciliations`, adjusts `unapplied_amount` on the transaction, and recalculates invoice status (`partially_paid` / `paid`) — all in one database transaction |

### Auto-reconciliation

Runs once at startup after ingestion. Matches transactions to invoices using three criteria in order of priority:

1. `structured_reference = invoice.id` — exact match (covers bank references and credit notes)
2. `description LIKE '%invoice.id%'` — invoice ID appears in the payment description
3. `customer_name ILIKE customer_id` — customer name loosely matches the customer ID

Applies the lesser of the transaction's `unapplied_amount` and the invoice total, then updates statuses accordingly.
