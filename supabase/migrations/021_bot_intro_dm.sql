ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS bot_intro_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_bot_intro_sent_at
ON public.users (bot_intro_sent_at);
