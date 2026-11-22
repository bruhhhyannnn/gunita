-- One-time codes that hand a Google sign-in from the browser to the desktop app.
CREATE TABLE login_codes (
  code_hash TEXT PRIMARY KEY,   -- sha-256 of the code sent through the gunita:// link
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,      -- sha-256 of a secret only the desktop app knows
  expires_at INTEGER NOT NULL
);
