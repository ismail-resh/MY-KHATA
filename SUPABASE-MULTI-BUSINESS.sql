-- MoneyMate Multi-Business migration
-- Run in Supabase Dashboard > SQL Editor BEFORE deploying the app update.
-- (Safe to run more than once.)
--
-- What it does:
--   1. businesses table (one row per business, owned by one user) + RLS policies
--   2. customers.business_id and transactions.business_id
--   3. gives every existing user a default business named "আমার ব্যবসা"
--      and moves ALL their existing customers + transactions into it
--   4. triggers so a row never ends up without a business, and a transaction
--      always belongs to the same business as its customer (even if an old,
--      cached copy of the app sends no business_id)

-- 1) businesses --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.businesses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  kind        text NOT NULL DEFAULT 'other'
              CHECK (kind IN ('grocery','pharmacy','dairy','rent','personal','other')),
  color       text NOT NULL DEFAULT 'green'
              CHECK (color IN ('green','orange','blue','purple','pink','gray')),
  is_default  boolean NOT NULL DEFAULT false,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- one default business per user, and no two businesses with the same name
CREATE UNIQUE INDEX IF NOT EXISTS businesses_one_default_per_user
  ON public.businesses (user_id) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS businesses_unique_name_per_user
  ON public.businesses (user_id, lower(btrim(name)));

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "businesses_select_own" ON public.businesses;
DROP POLICY IF EXISTS "businesses_insert_own" ON public.businesses;
DROP POLICY IF EXISTS "businesses_update_own" ON public.businesses;
DROP POLICY IF EXISTS "businesses_delete_own" ON public.businesses;

CREATE POLICY "businesses_select_own" ON public.businesses
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "businesses_insert_own" ON public.businesses
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "businesses_update_own" ON public.businesses
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "businesses_delete_own" ON public.businesses
  FOR DELETE TO authenticated USING (user_id = auth.uid() AND NOT is_default);

-- 2) business_id columns -------------------------------------------------------
-- ON DELETE RESTRICT: a business that still has customers/transactions cannot be deleted.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.businesses(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS customers_user_business_idx    ON public.customers (user_id, business_id);
CREATE INDEX IF NOT EXISTS transactions_user_business_idx ON public.transactions (user_id, business_id);

-- 3) default business for every existing user + move existing data into it -------
INSERT INTO public.businesses (user_id, name, kind, color, is_default, sort_order)
SELECT u.user_id, 'আমার ব্যবসা', 'other', 'green', true, 0
FROM (
  SELECT user_id FROM public.customers    WHERE user_id IS NOT NULL
  UNION
  SELECT user_id FROM public.transactions WHERE user_id IS NOT NULL
) u
WHERE NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.user_id = u.user_id);

UPDATE public.customers c
   SET business_id = b.id
  FROM public.businesses b
 WHERE b.user_id = c.user_id AND b.is_default AND c.business_id IS NULL;

-- a transaction follows its customer; leftovers go to the default business
UPDATE public.transactions t
   SET business_id = c.business_id
  FROM public.customers c
 WHERE t.customer_id = c.id AND t.business_id IS DISTINCT FROM c.business_id;

UPDATE public.transactions t
   SET business_id = b.id
  FROM public.businesses b
 WHERE b.user_id = t.user_id AND b.is_default AND t.business_id IS NULL;

-- 4) safety triggers -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mk_set_business_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v uuid;
BEGIN
  -- a transaction always uses its customer's business
  IF TG_TABLE_NAME = 'transactions' AND NEW.customer_id IS NOT NULL THEN
    SELECT c.business_id INTO v FROM public.customers c WHERE c.id = NEW.customer_id;
    IF v IS NOT NULL THEN
      NEW.business_id := v;
    END IF;
  END IF;

  -- still empty (old app version, offline leftovers): use the user's default business
  IF NEW.business_id IS NULL THEN
    SELECT b.id INTO v FROM public.businesses b WHERE b.user_id = NEW.user_id AND b.is_default LIMIT 1;
    NEW.business_id := v;
  END IF;

  -- the business must belong to the same user
  IF NEW.business_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.businesses b WHERE b.id = NEW.business_id AND b.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'business does not belong to this user';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_set_business ON public.customers;
CREATE TRIGGER customers_set_business
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.mk_set_business_id();

DROP TRIGGER IF EXISTS transactions_set_business ON public.transactions;
CREATE TRIGGER transactions_set_business
  BEFORE INSERT ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.mk_set_business_id();

-- Check later with:
--   SELECT name, is_default FROM public.businesses;
--   SELECT count(*) FILTER (WHERE business_id IS NULL) AS customers_without_business FROM public.customers;
--   SELECT count(*) FILTER (WHERE business_id IS NULL) AS transactions_without_business FROM public.transactions;
