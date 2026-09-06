-- FlowCash core schema for Neon PostgreSQL
-- Supabase is not used by this project.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS flowcash;

CREATE TABLE IF NOT EXISTS flowcash.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flowcash.wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  currency char(3) NOT NULL DEFAULT 'XAF',
  balance numeric(20,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallets_user_currency_unique UNIQUE (user_id, currency)
);

CREATE TABLE IF NOT EXISTS flowcash.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES flowcash.wallets(id) ON DELETE RESTRICT,
  type text NOT NULL CHECK (type IN ('deposit','withdrawal','transfer','payment','refund')),
  amount numeric(20,2) NOT NULL CHECK (amount > 0),
  currency char(3) NOT NULL DEFAULT 'XAF',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','failed','cancelled')),
  reference text NOT NULL UNIQUE,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON flowcash.wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON flowcash.transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON flowcash.transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON flowcash.transactions(status);

CREATE OR REPLACE FUNCTION flowcash.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON flowcash.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON flowcash.profiles
FOR EACH ROW EXECUTE FUNCTION flowcash.set_updated_at();

DROP TRIGGER IF EXISTS wallets_set_updated_at ON flowcash.wallets;
CREATE TRIGGER wallets_set_updated_at
BEFORE UPDATE ON flowcash.wallets
FOR EACH ROW EXECUTE FUNCTION flowcash.set_updated_at();

DROP TRIGGER IF EXISTS transactions_set_updated_at ON flowcash.transactions;
CREATE TRIGGER transactions_set_updated_at
BEFORE UPDATE ON flowcash.transactions
FOR EACH ROW EXECUTE FUNCTION flowcash.set_updated_at();
