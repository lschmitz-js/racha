CREATE TABLE IF NOT EXISTS players (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL CHECK(type IN ('season','dropin')),
  role            TEXT NOT NULL CHECK(role IN ('player','gk')),
  skills_json     TEXT NOT NULL,
  active          INTEGER NOT NULL DEFAULT 1,
  emergency_token TEXT,
  is_admin        INTEGER NOT NULL DEFAULT 0,
  password_hash   TEXT,
  created_at      INTEGER NOT NULL
);

-- Key/value app settings (e.g. vest colours). Small, admin-editable config.
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER
);

-- Server-side login sessions. Only the SHA-256 of the bearer token is stored so
-- a DB leak can't be replayed. user_id is a player id, or 'master' for the
-- RACHA_TOKEN break-glass identity.
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expiry ON auth_sessions(expires_at);

-- Append-only audit trail of admin actions (who / what / when), for the History
-- screen. Written by a single middleware after each state-changing request.
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  user_name  TEXT NOT NULL,
  action     TEXT NOT NULL,
  path       TEXT NOT NULL,
  status     INTEGER NOT NULL,
  detail     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at);

-- Sensitive emergency-contact data. Kept in a separate table so it is never
-- selected into the public GET /api/players response by accident.
CREATE TABLE IF NOT EXISTS player_emergency (
  player_id     TEXT PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  player_phone  TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  relationship  TEXT,
  medical_notes TEXT,
  updated_at    INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'draft',
  notes       TEXT,
  created_at  INTEGER NOT NULL,
  ended_at    INTEGER
);

CREATE TABLE IF NOT EXISTS session_players (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id  TEXT NOT NULL REFERENCES players(id),
  arrived    INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (session_id, player_id)
);

CREATE TABLE IF NOT EXISTS session_teams (
  id         TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  vest       TEXT NOT NULL CHECK(vest IN ('white','black','green')),
  UNIQUE(session_id, vest)
);

CREATE TABLE IF NOT EXISTS session_team_players (
  session_team_id TEXT NOT NULL REFERENCES session_teams(id) ON DELETE CASCADE,
  player_id       TEXT NOT NULL REFERENCES players(id),
  PRIMARY KEY (session_team_id, player_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id             TEXT PRIMARY KEY,
  session_id     TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ordinal        INTEGER NOT NULL,
  team_a_id      TEXT NOT NULL REFERENCES session_teams(id),
  team_b_id      TEXT NOT NULL REFERENCES session_teams(id),
  bench_team_id  TEXT NOT NULL REFERENCES session_teams(id),
  started_at     INTEGER,
  ended_at       INTEGER,
  elapsed_ms     INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending',
  result         TEXT NOT NULL DEFAULT 'pending',
  winner_team_id TEXT REFERENCES session_teams(id),
  UNIQUE(session_id, ordinal)
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id  TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  team_id   TEXT NOT NULL REFERENCES session_teams(id),
  starting  INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (match_id, player_id)
);

CREATE TABLE IF NOT EXISTS match_events (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  clock_ms   INTEGER NOT NULL,
  type       TEXT NOT NULL CHECK(type IN
             ('goal','assist','beautiful','silly','bad','save','caneta','quasegol','sub_in','sub_out')),
  player_id  TEXT NOT NULL REFERENCES players(id),
  team_id    TEXT NOT NULL REFERENCES session_teams(id),
  link_id    TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_match  ON match_events(match_id, clock_ms);
CREATE INDEX IF NOT EXISTS idx_events_player ON match_events(player_id, type);

-- Weekly game check-ins (RSVP). Keyed by game_date (YYYY-MM-DD, from the shared
-- schedule's nextGameDateISO), so each week's board is independent and rolls
-- over automatically as the schedule advances. status is 'in' or 'out';
-- checked_in_at records when the player last set 'in' (the waitlist tiebreaker).
-- Writes are public/honor-system (like emergency self-service).
CREATE TABLE IF NOT EXISTS checkins (
  id            TEXT PRIMARY KEY,
  game_date     TEXT NOT NULL,
  player_id     TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'in' CHECK(status IN ('in','out')),
  checked_in_at INTEGER,
  updated_at    INTEGER NOT NULL,
  UNIQUE(game_date, player_id)
);
CREATE INDEX IF NOT EXISTS idx_checkins_date ON checkins(game_date);

-- Player loans between teams during a session's winner-stays rotation. When a
-- short team borrows players from the team that just left, a loan records where
-- each player should return to. A borrowed player stays while the borrower keeps
-- winning; when the borrower goes to the bench (loses / steps off), the loan is
-- closed and the player moves back to home_team_id.
CREATE TABLE IF NOT EXISTS team_loans (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  player_id        TEXT NOT NULL,
  home_team_id     TEXT NOT NULL,
  borrower_team_id TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  returned_at      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_loans_active ON team_loans(session_id, borrower_team_id) WHERE returned_at IS NULL;
