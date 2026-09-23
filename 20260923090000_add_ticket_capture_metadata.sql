/* Universal screenshot capture metadata for bets. */

ALTER TABLE bets ADD COLUMN IF NOT EXISTS capture_source text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS capture_confidence numeric;

COMMENT ON COLUMN bets.capture_source IS 'Calculator/layout identified from a screenshot import.';
COMMENT ON COLUMN bets.capture_confidence IS 'AI extraction confidence from 0 to 1.';
