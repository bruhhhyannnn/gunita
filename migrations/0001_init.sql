-- Accounts
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE,
  email TEXT,
  name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,          -- sha-256 of the cookie token
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Yjs document updates. Every page body and the workspace are Yjs docs.
CREATE TABLE doc_updates (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_doc_updates_doc ON doc_updates(user_id, doc_id, seq);
CREATE INDEX idx_doc_updates_user_seq ON doc_updates(user_id, seq);

-- Read-only public links
CREATE TABLE shares (
  slug TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_shares_page ON shares(user_id, page_id);

-- Uploaded files in R2
CREATE TABLE files (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  content_type TEXT,
  size INTEGER,
  created_at INTEGER NOT NULL
);

-- Google Calendar tokens (refresh token encrypted with SESSION_SECRET)
CREATE TABLE google_tokens (
  user_id TEXT PRIMARY KEY,
  refresh_token_enc TEXT,
  access_token TEXT,
  expires_at INTEGER,
  scope TEXT
);
