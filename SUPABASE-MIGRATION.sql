-- MoneyMate Offline Sync safety migration
-- Run in Supabase Dashboard > SQL Editor BEFORE deploying this ZIP.
-- This adds stable operation IDs so retries after a lost response do not duplicate inserts.
-- Existing rows remain valid because client_operation_id is nullable.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS client_operation_id text;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS client_operation_id text;

-- Ordinary UNIQUE indexes allow multiple NULL values but reject duplicate non-NULL operation IDs.
CREATE UNIQUE INDEX IF NOT EXISTS customers_client_operation_id_uidx
  ON public.customers (client_operation_id);

CREATE UNIQUE INDEX IF NOT EXISTS transactions_client_operation_id_uidx
  ON public.transactions (client_operation_id);

-- Ensure RLS is enabled. Review the policies below manually; enabling RLS without a valid
-- policy may block app operations, while an existing overly-broad policy may still expose data.
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- REQUIRED SECURITY CHECK:
-- For BOTH tables, authenticated users should only SELECT/INSERT/UPDATE/DELETE rows where
-- user_id = auth.uid(). For INSERT, use WITH CHECK (user_id = auth.uid()).
-- Review/remove any old permissive policies that allow access to all rows; permissive policies
-- combine with OR, so adding a safe policy does not neutralize an unsafe existing policy.
