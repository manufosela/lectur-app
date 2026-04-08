-- LecturAPP - Initial schema migration
-- Requires PostgreSQL 16+ with pg_trgm extension

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Catalog items (books, audiobooks, comics - hierarchical)
CREATE TABLE catalog_items (
  id SERIAL PRIMARY KEY,
  type VARCHAR(20) NOT NULL CHECK (type IN ('book', 'audiobook', 'comic', 'folder')),
  name VARCHAR(500) NOT NULL,
  path TEXT NOT NULL UNIQUE,
  parent_path TEXT,
  extension VARCHAR(10),
  size_bytes BIGINT,
  indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reading history / progress
CREATE TABLE reading_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_path TEXT NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('book', 'audiobook', 'comic')),
  title VARCHAR(500) NOT NULL,
  progress REAL NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  current_position TEXT,
  total TEXT,
  last_read TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content_path)
);

-- Indexes for fast search with pg_trgm (fuzzy/partial text matching)
CREATE INDEX idx_catalog_name_trgm ON catalog_items USING GIN (name gin_trgm_ops);

-- B-tree indexes for common queries
CREATE INDEX idx_catalog_type ON catalog_items (type);
CREATE INDEX idx_catalog_parent ON catalog_items (parent_path);
CREATE INDEX idx_catalog_type_parent ON catalog_items (type, parent_path);

-- Reading history indexes
CREATE INDEX idx_history_user ON reading_history (user_id);
CREATE INDEX idx_history_user_type ON reading_history (user_id, content_type);
CREATE INDEX idx_history_user_lastread ON reading_history (user_id, last_read DESC);
