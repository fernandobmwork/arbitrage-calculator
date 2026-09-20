/*
# Add result tracking and bookmaker columns

1. Modified Tables
- `matches` — add `result` text column (home/draw/away) and `score_home`/`score_away` int columns
  - result (text, nullable) — 'home' | 'draw' | 'away' | null when not yet finished
  - score_home (int, nullable) — goals scored by home team
  - score_away (int, nullable) — goals scored by away team
- `bets` — add `winning_outcome` text and `bookmaker_green` text columns
  - winning_outcome (text, nullable) — which outcome won (e.g. "Casa", "Empate", "Fora", "Linha 1", etc.)
  - bookmaker_green (text, nullable) — name of the bookmaker where the green (winning bet) occurred
  - Also add `bookmakers` jsonb column to store per-row bookmaker names from the calculator

2. Security
- No new tables, existing RLS policies cover the new columns (column-level not needed for single-tenant).
*/

ALTER TABLE matches ADD COLUMN IF NOT EXISTS result text;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_home int;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS score_away int;

ALTER TABLE bets ADD COLUMN IF NOT EXISTS winning_outcome text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS bookmaker_green text;
ALTER TABLE bets ADD COLUMN IF NOT EXISTS bookmakers jsonb;
