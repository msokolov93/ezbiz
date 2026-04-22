# Database

PostgreSQL schema defined in `init.sql`. Runs once when the database volume is first created.

## Tables

### `customers`
Stores unique companies extracted from invoices. Acts as the reference for customer identity across invoices and transactions.

### `invoices`
Each row is either an invoice or a credit note (indicated by `type`). Credit notes are linked back to their original invoice via `related_invoice_id`. The `status` field tracks reconciliation progress:

| Status | Meaning |
|--------|---------|
| `open` | No payments applied yet |
| `partially_paid` | Some amount has been matched but the balance remains |
| `paid` | Total has been fully covered by reconciled transactions |

### `transactions`
Incoming bank transactions. Key fields for reconciliation:

- `unapplied_amount` — tracks how much of this transaction is still available to match against invoices; decremented with each reconciliation
- `structured_reference` — the invoice ID carried in the bank transfer (if provided); used as the primary auto-match key
- `counterparty_name` — the name as it appears on the bank statement, distinct from `customer_name` which is the normalised name from the invoice
- `status` — `unreconciled` → `partial` → `reconciled` as the transaction is consumed

### `reconciliations`
The bridge table linking transactions to invoices (many-to-many). Each row records how much of a transaction was applied to a specific invoice. The sum of `amount_applied` for an invoice determines whether it is `partially_paid` or `paid`.

A unique constraint on `(invoice_id, transaction_id)` prevents duplicate entries. One transaction can partially cover multiple invoices, and one invoice can be covered by multiple transactions.

### `users`
Application login accounts. Passwords are stored as bcrypt hashes. The `role` field controls API access:

| Role | Access |
|------|--------|
| `viewer` | Read-only: dashboard, invoice details |
| `admin` | Full access including posting reconciliations |

## Reconciliation flow

```
transactions  ──┐
                ├──▶  reconciliations  ──▶  invoice.status
invoices      ──┘         (bridge)
```

A transaction's `unapplied_amount` is reduced each time a reconciliation row is created. An invoice's status is derived from the sum of all `amount_applied` values linked to it compared to its `total`.
