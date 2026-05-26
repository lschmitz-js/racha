CREATE TABLE IF NOT EXISTS players (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL CHECK(type IN ('season','dropin')),
  role         TEXT NOT NULL CHECK(role IN ('player','gk')),
  skills_json  TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL
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
