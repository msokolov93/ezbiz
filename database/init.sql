CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table (for frontend auth)
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL         PRIMARY KEY,
  username     VARCHAR(100)   NOT NULL UNIQUE,
  email        VARCHAR(255)   NOT NULL UNIQUE,
  password_hash TEXT          NOT NULL,
  role         VARCHAR(20)    NOT NULL DEFAULT 'viewer',
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  last_login   TIMESTAMPTZ
);

-- Customers
CREATE TABLE IF NOT EXISTS customers (
  customer_id  VARCHAR(20)    PRIMARY KEY,
  name         VARCHAR(255)   NOT NULL,
  vat_number   VARCHAR(50)
);

-- Invoices & Credit Notes
CREATE TABLE IF NOT EXISTS invoices (
  id                 VARCHAR(30)    PRIMARY KEY,
  type               VARCHAR(20)    NOT NULL, -- e.g., 'invoice', 'credit_note'
  customer_id        VARCHAR(20)    REFERENCES customers(customer_id),
  related_invoice_id VARCHAR(30)    REFERENCES invoices(id), -- Points to original invoice if this is a credit note
  issue_date         DATE,
  due_date           DATE,
  currency           CHAR(3)        NOT NULL DEFAULT 'EUR',
  subtotal           NUMERIC(12, 2),
  tax_total          NUMERIC(12, 2),
  total              NUMERIC(12, 2) NOT NULL,
  source             VARCHAR(255),
  status             VARCHAR(20)    DEFAULT 'open' -- 'open', 'partially_paid', 'paid'
);

-- Bank Transactions
CREATE TABLE IF NOT EXISTS transactions (
  id                   VARCHAR(50)    PRIMARY KEY,
  transaction_date     DATE           NOT NULL,
  amount               NUMERIC(12, 2) NOT NULL,
  currency             CHAR(3)        NOT NULL DEFAULT 'EUR',
  description          TEXT,
  customer_name        VARCHAR(255),
  counterparty_name    VARCHAR(255),
  structured_reference VARCHAR(100),
  unapplied_amount     NUMERIC(12, 2) NOT NULL,
  status               VARCHAR(20)    DEFAULT 'unreconciled'
);

-- The Bridge Table (Many-to-Many)
CREATE TABLE IF NOT EXISTS reconciliations (
  id             SERIAL         PRIMARY KEY,
  invoice_id     VARCHAR(30)    NOT NULL REFERENCES invoices(id),
  transaction_id VARCHAR(50)    NOT NULL REFERENCES transactions(id),
  amount_applied NUMERIC(12, 2) NOT NULL,
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE(invoice_id, transaction_id)
);