-- Remove any previously stored football-data.org credential from app_settings.
-- Configure the new credential as the Edge Function secret FOOTBALL_DATA_API_KEY.
DELETE FROM app_settings WHERE key IN ('football_api_key', 'football_data_api_key');
