-- 20260510_seed_connected_services.sql
-- Sprint 5 Stream F — seed connected_services with the 5 active Unicron services.
-- Uses ON CONFLICT DO NOTHING so re-running is safe.

INSERT INTO nervous_system.connected_services
  (name, category, status, monthly_cost_usd, config_url, notes)
VALUES
  ('Supabase',   'infrastructure', 'healthy', 25.00,  'https://supabase.com/dashboard',    'Primary database + auth + realtime'),
  ('Vercel',     'infrastructure', 'healthy', 20.00,  'https://vercel.com/dashboard',      'Pathfinder + unicron-platform hosting'),
  ('OpenAI',     'ai',             'healthy', 50.00,  'https://platform.openai.com',       'Whisper STT for voice memo ingest'),
  ('Anthropic',  'ai',             'healthy', 100.00, 'https://console.anthropic.com',     'Claude claude-sonnet-4-5/Opus for agent intelligence'),
  ('Slack',      'communication',  'healthy', 0.00,   'https://slack.com/apps',            'Free tier — orchestrator interaction surface')
ON CONFLICT DO NOTHING;
