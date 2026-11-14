CREATE TABLE app_user (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    login text NOT NULL UNIQUE CHECK (login ~ '^[a-z0-9_]{3,64}$'),
    display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
    password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 48),
    role text NOT NULL CHECK (role IN ('visitor','admin')),
    blocked boolean NOT NULL DEFAULT false
);
CREATE TABLE app_session (
    token_hash bytea PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL
);
CREATE INDEX app_session_user_idx ON app_session(user_id);
CREATE TABLE audit_event (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id bigint NOT NULL REFERENCES app_user(id),
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id bigint NOT NULL,
    details jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
