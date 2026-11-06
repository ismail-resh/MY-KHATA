-- MoneyMate Recycle Bin migration
-- Run in Supabase Dashboard > SQL Editor BEFORE deploying the app update.
-- (Safe to run more than once.)
--
-- What it does:
--   1. customers.deleted_at   -> NULL = active, a date = in the recycle bin
--   2. index for fast bin lookups
--   3. trigger: when a customer row is permanently deleted, its transactions go too
--      (works even if your foreign key is not ON DELETE CASCADE)
--   4. pg_cron job: every day permanently deletes customers that have been in the
--      bin for more than 30 days

-- 1) soft-delete column ------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2) index -------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS customers_user_deleted_at_idx
  ON public.customers (user_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- 3) delete a customer's transactions together with the customer --------------
CREATE OR REPLACE FUNCTION public.delete_customer_transactions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.transactions WHERE customer_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS customers_delete_transactions ON public.customers;
CREATE TRIGGER customers_delete_transactions
  BEFORE DELETE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.delete_customer_transactions();

-- 4) automatic purge after 30 days -------------------------------------------
-- pg_cron must be enabled. If the next line errors, go to
-- Dashboard > Database > Extensions, enable "pg_cron", then run this file again.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- remove an older copy of the job (ignore the error if it does not exist yet)
DO $$
BEGIN
  PERFORM cron.unschedule('moneymate-purge-recycle-bin');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- every day at 03:00 UTC (09:00 AM Bangladesh time)
SELECT cron.schedule(
  'moneymate-purge-recycle-bin',
  '0 3 * * *',
  $$ DELETE FROM public.customers
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - interval '30 days' $$
);

-- Check later with:
--   SELECT * FROM cron.job;                                  -- the job is listed
--   SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 5;
