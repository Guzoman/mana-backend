-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT UNIQUE,
    email_verified BOOLEAN NOT NULL DEFAULT false,
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Create WebAuthn credentials table
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    credential_id BYTEA PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    transports TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    revoked BOOLEAN NOT NULL DEFAULT false
);

-- Create player saves table
CREATE TABLE IF NOT EXISTS player_saves (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    player_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    etag TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create session data table (transitorio)
CREATE TABLE IF NOT EXISTS session_data (
    user_id UUID NOT NULL,
    session_id UUID NOT NULL,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, session_id)
);

-- Create turn ledger table
CREATE TABLE IF NOT EXISTS turn_ledger (
    user_id UUID NOT NULL,
    session_id UUID NOT NULL,
    turn_no INTEGER NOT NULL,
    json_i JSONB,
    json_ii JSONB,
    canvas_delta JSONB,
    feedback_delta JSONB,
    comment_delta JSONB,
    memory_updates JSONB,
    summary160 TEXT,
    verbatim_user TEXT,
    verbatim_coach TEXT,
    is_meta BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, session_id, turn_no)
);

-- Create crystal groups table
CREATE TABLE IF NOT EXISTS crystal_groups (
    group_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL,
    closing_remark TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create essences table
CREATE TABLE IF NOT EXISTS essences (
    essence_id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    group_id UUID REFERENCES crystal_groups(group_id) ON DELETE CASCADE,
    arch_code TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('candidate', 'active', 'nulled')),
    level INTEGER NOT NULL DEFAULT 1,
    parent_id UUID REFERENCES essences(essence_id),
    op_type TEXT,
    text_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    transmutable_to UUID[],
    image_key TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Create inventory table
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    qty INTEGER NOT NULL DEFAULT 1,
    properties JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
CREATE INDEX IF NOT EXISTS idx_player_saves_updated_at ON player_saves(updated_at);
CREATE INDEX IF NOT EXISTS idx_turn_ledger_session ON turn_ledger(user_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_crystal_groups_user_created ON crystal_groups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_essences_user_created ON essences(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_essences_group_status ON essences(group_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_owner ON inventory(owner_id);
