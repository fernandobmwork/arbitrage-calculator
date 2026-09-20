import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Match = {
  id: string;
  external_match_id: number | null;
  competition_code: string | null;
  season: number | null;
  home_team: string;
  away_team: string;
  home_team_id: number | null;
  away_team_id: number | null;
  league: string;
  match_date: string | null;
  status: 'upcoming' | 'live' | 'finished';
  home_odd: number;
  draw_odd: number;
  away_odd: number;
  result: 'home' | 'draw' | 'away' | null;
  score_home: number | null;
  score_away: number | null;
  last_api_update: string | null;
  created_at: string;
};

export type Bet = {
  id: string;
  match_id: string | null;
  description: string;
  total_stake: number;
  profit: number;
  profit_percent: number;
  status: 'pending' | 'won' | 'lost';
  winning_outcome: string | null;
  bookmaker_green: string | null;
  bookmakers: Record<string, unknown> | null;
  calculator_state: Record<string, unknown> | null;
  created_at: string;
};
