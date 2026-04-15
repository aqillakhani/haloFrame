-- =============================================================================
-- v1.3 — Multi-select tribute styles
--
-- Replace the single `template_id text` column with a JSONB array so a
-- tribute can record any combination of styles a user picked. The application
-- combines multiple prompts into a single Nano Banana 2 call, but the DB
-- keeps an auditable record of every style stacked.
-- =============================================================================

-- 1. Drop the old FK that pointed at tribute_templates(id).
ALTER TABLE public.tributes
  DROP CONSTRAINT IF EXISTS tributes_template_id_fkey;

-- 2. Rename the legacy column so we can migrate its data into the new one.
ALTER TABLE public.tributes
  RENAME COLUMN template_id TO template_id_legacy;

-- 3. Add the new JSONB array column. Default to an empty array so existing
--    rows and future inserts never see NULL.
ALTER TABLE public.tributes
  ADD COLUMN template_ids jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 4. Backfill: each legacy non-null single ID becomes a one-element array.
UPDATE public.tributes
SET template_ids = to_jsonb(ARRAY[template_id_legacy])
WHERE template_id_legacy IS NOT NULL;

-- 5. Enforce JSONB array shape.
ALTER TABLE public.tributes
  ADD CONSTRAINT tributes_template_ids_is_array
  CHECK (jsonb_typeof(template_ids) = 'array');

-- 6. Drop the legacy column now that data is preserved.
ALTER TABLE public.tributes
  DROP COLUMN template_id_legacy;

-- 7. Index for membership lookups ("tributes using template X").
CREATE INDEX IF NOT EXISTS tributes_template_ids_gin_idx
  ON public.tributes USING GIN (template_ids);
