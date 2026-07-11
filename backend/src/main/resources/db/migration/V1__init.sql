CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devices (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name   text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_devices_user_id ON devices(user_id);

CREATE TABLE refresh_tokens (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    token_hash      text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    expires_at      timestamptz NOT NULL,
    revoked_at      timestamptz NULL,
    replaced_by_id  uuid NULL REFERENCES refresh_tokens(id)
);

CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_device_id ON refresh_tokens(device_id);

CREATE TABLE user_settings (
    user_id               uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    reset_day             integer NOT NULL,
    daily_limit_minutes   integer NOT NULL,
    weekly_limit_minutes  integer NOT NULL,
    updated_at            timestamptz NOT NULL
);

CREATE TABLE tracked_patterns (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_type   text NOT NULL CHECK (pattern_type IN ('domain', 'url')),
    pattern_value  text NOT NULL,
    active         boolean NOT NULL DEFAULT true,
    updated_at     timestamptz NOT NULL,
    UNIQUE (user_id, pattern_type, pattern_value)
);

CREATE INDEX idx_tracked_patterns_user_id ON tracked_patterns(user_id);

CREATE TABLE time_entries (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id      uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    pattern_type   text NOT NULL CHECK (pattern_type IN ('domain', 'url')),
    pattern_value  text NOT NULL,
    entry_date     date NOT NULL,
    seconds        bigint NOT NULL,
    updated_at     timestamptz NOT NULL,
    UNIQUE (user_id, device_id, pattern_type, pattern_value, entry_date)
);

CREATE INDEX idx_time_entries_user_pattern_date ON time_entries(user_id, pattern_type, pattern_value, entry_date);
