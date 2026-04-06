CREATE TABLE IF NOT EXISTS settlement_reminder_settings (
  singleton TEXT PRIMARY KEY DEFAULT 'default' CHECK (singleton = 'default'),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  next_notification_on DATE NOT NULL DEFAULT CURRENT_DATE,
  interval_months INTEGER NOT NULL DEFAULT 1 CHECK (interval_months BETWEEN 1 AND 12),
  notification_day INTEGER NOT NULL DEFAULT 1 CHECK (notification_day BETWEEN 1 AND 31),
  last_notified_on DATE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER settlement_reminder_settings_updated_at
BEFORE UPDATE ON settlement_reminder_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

INSERT INTO settlement_reminder_settings (
  singleton,
  is_enabled,
  next_notification_on,
  interval_months,
  notification_day
)
VALUES (
  'default',
  true,
  CURRENT_DATE,
  1,
  EXTRACT(DAY FROM CURRENT_DATE)::INTEGER
)
ON CONFLICT (singleton) DO NOTHING;
