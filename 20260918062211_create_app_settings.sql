/*
# App settings table for storing API keys and configuration
*/
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- No policies: only the service role (edge functions) can access this table.
-- The anon/authenticated roles should NOT be able to read API keys.

-- API keys are configured as Supabase Edge Function secrets, never committed to migrations.

