-- A persisted purchasing policy, independent of the product's name thereafter.
ALTER TABLE public.ppe_products
  ADD COLUMN can_reorder boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.ppe_products.can_reorder IS
  'Whether the item may be replenished by purchasing; false retains stock and transaction history.';

-- One-time initialization for existing reused items, across company catalogs.
-- Later name changes and manual overrides must not reapply this rule.
UPDATE public.ppe_products
SET can_reorder = false
WHERE name LIKE '%มือสอง%';

NOTIFY pgrst, 'reload schema';
