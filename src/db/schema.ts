export const CREATE_TABLES_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'post_reply',
  status TEXT NOT NULL DEFAULT 'pending',
  reply TEXT NOT NULL,
  total_items INTEGER NOT NULL DEFAULT 0,
  successful_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  skipped_items INTEGER NOT NULL DEFAULT 0,
  confirmation_mode TEXT NOT NULL DEFAULT 'batch',
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  excluded_usernames TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

CREATE TABLE IF NOT EXISTS job_items (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  post_url TEXT NOT NULL,
  post_id TEXT NOT NULL,
  username TEXT,
  reply TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  screenshot_path TEXT,
  started_at TEXT,
  completed_at TEXT,
  comment_data TEXT,
  excluded_usernames TEXT,
  item_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  max_posts_per_job INTEGER NOT NULL DEFAULT 300,
  confirmation_mode TEXT NOT NULL DEFAULT 'batch',
  navigation_timeout_ms INTEGER NOT NULL DEFAULT 30000,
  action_timeout_ms INTEGER NOT NULL DEFAULT 10000,
  max_retries INTEGER NOT NULL DEFAULT 2,
  keep_browser_open_on_finish INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
`;
