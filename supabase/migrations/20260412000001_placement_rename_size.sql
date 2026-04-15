-- Rename placement 'center' -> 'front' and add size_adjustment column
-- v1.2 UX polish

-- Update existing rows that used 'center'
UPDATE public.tributes SET placement = 'front' WHERE placement = 'center';

-- Drop and re-add the check constraint
ALTER TABLE public.tributes DROP CONSTRAINT IF EXISTS tributes_placement_check;
ALTER TABLE public.tributes
  ADD CONSTRAINT tributes_placement_check
  CHECK (placement IS NULL OR placement IN ('left','right','behind','front'));

-- Add size_adjustment column
ALTER TABLE public.tributes
  ADD COLUMN IF NOT EXISTS size_adjustment real NOT NULL DEFAULT 1.0;
