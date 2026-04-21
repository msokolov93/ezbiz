CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Users table (for frontend auth)
CREATE TABLE IF NOT EXISTS users (
  id           SERIAL         PRIMARY KEY,
  username     VARCHAR(100)   NOT NULL UNIQUE,
  email        VARCHAR(255)   NOT NULL UNIQUE,
  password_hash TEXT          NOT NULL,           -- store bcrypt/argon2 hash, NEVER plain text
  role         VARCHAR(20)    NOT NULL DEFAULT 'viewer',  -- e.g. 'admin', 'viewer'
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  last_login   TIMESTAMPTZ
);

-- Invoices customers
CREATE TABLE IF NOT EXISTS customers (
  customer_id  VARCHAR(20)    PRIMARY KEY,
  name         VARCHAR(255)   NOT NULL,
  vat_number   VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS invoices (
  id           VARCHAR(30)    PRIMARY KEY,
  type         VARCHAR(20)    NOT NULL,
  customer_id  VARCHAR(20)    REFERENCES customers(customer_id),
  issue_date   DATE,
  due_date     DATE,
  currency     CHAR(3)        NOT NULL DEFAULT 'EUR',
  subtotal     NUMERIC(12, 2),
  tax_total    NUMERIC(12, 2),
  total        NUMERIC(12, 2) NOT NULL,
  source       VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  line_id      VARCHAR(40)    PRIMARY KEY,
  invoice_id   VARCHAR(30)    NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT           NOT NULL,
  quantity     INTEGER        NOT NULL,
  unit_price   NUMERIC(12, 2) NOT NULL,
  tax_rate     NUMERIC(5, 4)  NOT NULL,
  amount       NUMERIC(12, 2) NOT NULL
);