-- Esquema inicial (CLAUDE.md, sección 6).

CREATE TABLE accounts (
  id               INTEGER PRIMARY KEY,
  name             TEXT NOT NULL,
  institution      TEXT,
  type             TEXT NOT NULL CHECK (type IN ('credit_card','debit_card','savings','wallet','cash')),
  wallet_card_name TEXT,
  currency         TEXT NOT NULL DEFAULT 'COP',
  active           INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE categories (
  id             INTEGER PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE,
  kind           TEXT NOT NULL CHECK (kind IN ('expense','income','internal')),
  color          TEXT,
  monthly_budget INTEGER
);

CREATE TABLE transactions (
  id           INTEGER PRIMARY KEY,
  occurred_at  TEXT NOT NULL,
  local_date   TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  currency     TEXT NOT NULL DEFAULT 'COP',
  type         TEXT NOT NULL CHECK (type IN ('expense','income','internal')),
  merchant_raw TEXT,
  merchant     TEXT,
  category_id  INTEGER REFERENCES categories(id),
  account_id   INTEGER REFERENCES accounts(id),
  source       TEXT NOT NULL CHECK (source IN ('apple_pay','sms','email','receipt','manual','csv')),
  status       TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','review')),
  note         TEXT,
  raw_payload  TEXT,
  dedupe_key   TEXT UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tx_local_date ON transactions(local_date);
CREATE INDEX idx_tx_category   ON transactions(category_id, local_date);
CREATE INDEX idx_tx_account    ON transactions(account_id, local_date);
CREATE INDEX idx_tx_status     ON transactions(status);

CREATE TABLE rules (
  id            INTEGER PRIMARY KEY,
  pattern       TEXT NOT NULL,
  merchant_name TEXT,
  category_id   INTEGER REFERENCES categories(id),
  type          TEXT CHECK (type IN ('expense','income','internal')),
  priority      INTEGER NOT NULL DEFAULT 100
);
