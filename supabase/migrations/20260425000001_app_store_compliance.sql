-- =============================================================================
-- App Store + Play Store compliance schema additions (2026-04-25)
-- =============================================================================
-- Adds:
--   profiles.ai_consent_at        — timestamp of explicit AI processing consent
--   tributes.flagged_at           — timestamp when content was reported
--   tributes.flagged_reason       — short reason text (mirror of latest report)
--   reports                       — full audit trail of user-submitted reports
--
-- All changes are additive (no drops, no rewrites) → safe to apply on a live DB
-- with zero downtime. See docs/plans/2026-04-25-app-store-launch-design.md §7.D.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS ai_consent_at TIMESTAMPTZ NULL;

ALTER TABLE tributes
  ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS flagged_reason TEXT NULL;

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tribute_id UUID NOT NULL REFERENCES tributes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (char_length(reason) <= 64),
  note TEXT NULL CHECK (char_length(note) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lightweight indices for the moderation queue (admin-side; not used by SDK).
CREATE INDEX IF NOT EXISTS reports_tribute_idx ON reports (tribute_id);
CREATE INDEX IF NOT EXISTS reports_created_idx ON reports (created_at DESC);

-- RLS: only the service role writes to reports. Users never read this table
-- directly; their own POST goes through the API which uses service role.
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_service_only" ON reports;
CREATE POLICY "reports_service_only"
  ON reports FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
