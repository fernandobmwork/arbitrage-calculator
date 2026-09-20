/*
# Create matches and bets tables (single-tenant, no auth)

1. New Tables
- `matches` — football matches available for the arbitrage calculator
  - id (uuid, primary key)
  - home_team (text, not null) — home team name
  - away_team (text, not null) — away team name
  - league (text) — competition/league name
  - match_date (timestamptz) — when the match starts
  - status (text, default 'upcoming') — upcoming | live | finished
  - home_odd (numeric) — odds for home win
  - draw_odd (numeric) — odds for draw (nullable, for 2-way markets)
  - away_odd (numeric) — odds for away win
  - created_at (timestamptz)
- `bets` — bets registered from the calculator, linked optionally to a match
  - id (uuid, primary key)
  - match_id (uuid, nullable, references matches) — optional link to a match
  - description (text) — label for the bet
  - total_stake (numeric, default 0) — total amount invested
  - profit (numeric, default 0) — calculated profit
  - profit_percent (numeric, default 0) — profit as % of stake
  - status (text, default 'pending') — pending | won | lost
  - calculator_state (jsonb) — full calculator snapshot for reference
  - created_at (timestamptz)

2. Security
- Enable RLS on both tables.
- Allow anon + authenticated CRUD on both (single-tenant, no sign-in).
*/

CREATE TABLE IF NOT EXISTS matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_team text NOT NULL,
  away_team text NOT NULL,
  league text DEFAULT '',
  match_date timestamptz,
  status text NOT NULL DEFAULT 'upcoming',
  home_odd numeric DEFAULT 0,
  draw_odd numeric DEFAULT 0,
  away_odd numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_matches" ON matches;
CREATE POLICY "anon_select_matches" ON matches FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_matches" ON matches;
CREATE POLICY "anon_insert_matches" ON matches FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_matches" ON matches;
CREATE POLICY "anon_update_matches" ON matches FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_matches" ON matches;
CREATE POLICY "anon_delete_matches" ON matches FOR DELETE
  TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  total_stake numeric NOT NULL DEFAULT 0,
  profit numeric NOT NULL DEFAULT 0,
  profit_percent numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  calculator_state jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bets" ON bets;
CREATE POLICY "anon_select_bets" ON bets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bets" ON bets;
CREATE POLICY "anon_insert_bets" ON bets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bets" ON bets;
CREATE POLICY "anon_update_bets" ON bets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bets" ON bets;
CREATE POLICY "anon_delete_bets" ON bets FOR DELETE
  TO anon, authenticated USING (true);
