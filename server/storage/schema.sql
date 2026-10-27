PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- Shared: a source definition and its collection status.
CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS story_groups (
  id INTEGER PRIMARY KEY,
  identity TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  group_id INTEGER NOT NULL REFERENCES story_groups(id),
  source_id TEXT NOT NULL REFERENCES sources(id),
  external_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT NOT NULL,
  release_text TEXT NOT NULL,
  published_at TEXT,
  first_seen_at TEXT NOT NULL,
  last_fetched_at TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  topics TEXT NOT NULL,
  kind TEXT NOT NULL,
  links TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  UNIQUE(source_id, external_id)
);
CREATE INDEX IF NOT EXISTS items_group ON items(group_id);

-- Personal: one local profile now, user IDs can replace 'local' later.
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS personal_state (
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  group_id INTEGER NOT NULL REFERENCES story_groups(id),
  read INTEGER NOT NULL DEFAULT 0,
  saved INTEGER NOT NULL DEFAULT 0,
  dismissed INTEGER NOT NULL DEFAULT 0,
  feedback INTEGER NOT NULL DEFAULT 0,
  read_token TEXT,
  PRIMARY KEY(profile_id, group_id)
);

-- Shared generated results. No model executes in the server.
CREATE TABLE IF NOT EXISTS summaries (
  content_hash TEXT NOT NULL,
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  interest_key TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(content_hash, model_id, prompt_version, interest_key)
);
CREATE TABLE IF NOT EXISTS http_cache (
  url TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  checked_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS followed_topics (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS topic_items (
  topic_id TEXT NOT NULL REFERENCES followed_topics(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL,
  group_id INTEGER NOT NULL REFERENCES story_groups(id),
  PRIMARY KEY(topic_id, provider_id, group_id)
);
CREATE TABLE IF NOT EXISTS summary_results (
  input_text TEXT NOT NULL,
  depth TEXT NOT NULL,
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  interest_key TEXT NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(input_text, depth, model_id, prompt_version, interest_key)
);

-- Observed immutable excerpts, not inferred full-paper change history.
CREATE TABLE IF NOT EXISTS item_history (
  item_id INTEGER NOT NULL REFERENCES items(id),
  content_hash TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(item_id,content_hash)
);
CREATE TABLE IF NOT EXISTS paper_versions (
  paper_key TEXT NOT NULL,
  version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(paper_key,version)
);
CREATE TABLE IF NOT EXISTS research_trails (
  group_id INTEGER PRIMARY KEY REFERENCES story_groups(id),
  payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS trail_links (
  group_id INTEGER NOT NULL REFERENCES story_groups(id),
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(group_id,id)
);
