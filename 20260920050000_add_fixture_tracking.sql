-- Add stable football-data.org identifiers and synchronization metadata.
ALTER TABLE matches ADD COLUMN IF NOT EXISTS external_match_id bigint;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS competition_code text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS season int;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS home_team_id bigint;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS away_team_id bigint;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS last_api_update timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS matches_external_match_id_uidx
  ON matches(external_match_id)
  WHERE external_match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS matches_match_date_idx ON matches(match_date);
CREATE INDEX IF NOT EXISTS matches_home_team_id_idx ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS matches_away_team_id_idx ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS bets_pending_match_idx ON bets(match_id) WHERE status = 'pending';

-- Used by the edge function to avoid re-synchronizing the next 7 days on every poll.
INSERT INTO app_settings(key, value) VALUES ('fixtures_last_sync_at', '1970-01-01T00:00:00.000Z')
ON CONFLICT (key) DO NOTHING;
