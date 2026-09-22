-- 001_initial_schema.up.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,
    name        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       TEXT NOT NULL DEFAULT 'Untitled',
    owner_id    UUID NOT NULL REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_owner ON documents(owner_id);

CREATE TABLE document_members (
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (document_id, user_id)
);

CREATE TABLE document_snapshots (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    content       TEXT NOT NULL,
    crdt_state    BYTEA NOT NULL,
    op_count      INTEGER NOT NULL,
    created_by    UUID REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, version)
);
CREATE INDEX idx_snapshots_document ON document_snapshots(document_id, version DESC);

CREATE TABLE document_operations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    after_snapshot  INTEGER NOT NULL,
    op_data         BYTEA NOT NULL,
    op_id_replica   TEXT NOT NULL,
    op_id_counter   BIGINT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, op_id_replica, op_id_counter)
);
CREATE INDEX idx_operations_document ON document_operations(document_id, after_snapshot);
