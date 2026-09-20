-- Configure the football-data.org credential requested for this project.
-- SECURITY NOTE: this is intentionally stored server-side in app_settings and is NOT exposed to the frontend.
-- For production/public repositories, prefer the Supabase Edge Function secret FOOTBALL_DATA_API_KEY instead.

INSERT INTO app_settings(key, value)
VALUES ('football_data_api_key', 'f8d68dc6cdb74dfdbd4ae380ea4d5734')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
