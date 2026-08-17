-- Authentication data. Existing users remain readable; they can set a password
-- through the auth registration flow or an administrative migration.
ALTER TABLE users
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER avatar_seed,
  ADD COLUMN role ENUM('admin', 'user') NOT NULL DEFAULT 'user' AFTER password_hash,
  ADD COLUMN refresh_token_hash CHAR(64) NULL AFTER role,
  ADD COLUMN refresh_token_expires_at TIMESTAMP(3) NULL AFTER refresh_token_hash;

CREATE INDEX idx_users_role ON users (role);
