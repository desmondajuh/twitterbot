import { DatabaseSync } from "./sqlite";
import fs from "node:fs";
import path from "node:path";
import { getStorageDirectories } from "../automation/browser/browser-profile";
import { CREATE_TABLES_SQL } from "./schema";

let dbInstance: DatabaseSync | null = null;
let currentDbPath: string | null = null;

/**
 * Gets or initializes the SQLite database instance.
 * @param customPath Optional custom file path for testing (e.g. ":memory:" or temp file)
 */
export function getDb(customPath?: string): DatabaseSync {
  if (customPath) {
    if (customPath !== ":memory:") {
      const dir = path.dirname(customPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    const db = new DatabaseSync(customPath);
    db.exec(CREATE_TABLES_SQL);
    return db;
  }

  if (dbInstance) {
    return dbInstance;
  }

  const { userDataDir } = getStorageDirectories();
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  currentDbPath = path.join(userDataDir, "database.sqlite");
  dbInstance = new DatabaseSync(currentDbPath);
  dbInstance.exec(CREATE_TABLES_SQL);

  // Attempt automatic migration from existing JSON files on first initialization
  migrateFromJsonIfEmpty(dbInstance, userDataDir);

  return dbInstance;
}

/**
 * Automatically imports legacy jobs.json and settings.json if the SQLite tables are currently empty.
 */
function migrateFromJsonIfEmpty(db: DatabaseSync, userDataDir: string): void {
  try {
    // 1. Check if jobs table is empty
    const jobCountRow = db.prepare("SELECT COUNT(*) as count FROM jobs").get() as { count: number };
    const jobsJsonPath = path.join(userDataDir, "jobs.json");

    if (jobCountRow.count === 0 && fs.existsSync(jobsJsonPath)) {
      const raw = fs.readFileSync(jobsJsonPath, "utf-8");
      if (raw.trim()) {
        const parsed = JSON.parse(raw);
        const isDummy = (j: any) =>
          ["Test reply message", "Valid message", "Bulk educational engagement response", "To be deleted"].includes(j?.reply) ||
          String(j?.id || "").startsWith("job_test_");
        const validJobs = parsed.filter((j: any) => j && j.id && !isDummy(j));

        if (Array.isArray(validJobs) && validJobs.length > 0) {
          const insertJob = db.prepare(`
            INSERT INTO jobs (
              id, type, status, reply, total_items, successful_items, failed_items,
              skipped_items, confirmation_mode, created_at, started_at, completed_at, excluded_usernames
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const insertItem = db.prepare(`
            INSERT INTO job_items (
              id, job_id, post_url, post_id, username, reply, status, error,
              screenshot_path, started_at, completed_at, comment_data, excluded_usernames, item_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          for (const j of parsed) {
            if (!j || !j.id) continue;
            insertJob.run(
              j.id,
              j.type || "post_reply",
              j.status || "pending",
              j.reply || "",
              j.totalItems || 0,
              j.successfulItems || 0,
              j.failedItems || 0,
              j.skippedItems || 0,
              j.confirmationMode || "batch",
              j.createdAt ? new Date(j.createdAt).toISOString() : new Date().toISOString(),
              j.startedAt ? new Date(j.startedAt).toISOString() : null,
              j.completedAt ? new Date(j.completedAt).toISOString() : null,
              j.excludedUsernames ? JSON.stringify(j.excludedUsernames) : null
            );

            if (Array.isArray(j.items)) {
              j.items.forEach((item: any, idx: number) => {
                insertItem.run(
                  item.id,
                  j.id,
                  item.postUrl || "",
                  item.postId || "",
                  item.username || null,
                  item.reply || j.reply || "",
                  item.status || "pending",
                  item.error || null,
                  item.screenshotPath || null,
                  item.startedAt ? new Date(item.startedAt).toISOString() : null,
                  item.completedAt ? new Date(item.completedAt).toISOString() : null,
                  item.comment ? JSON.stringify(item.comment) : null,
                  item.excludedUsernames ? JSON.stringify(item.excludedUsernames) : null,
                  idx
                );
              });
            }
          }
          console.log(`[Database] Migrated ${parsed.length} jobs from jobs.json into SQLite`);
        }
      }
    }

    // 2. Check if settings table is empty
    const settingsCountRow = db.prepare("SELECT COUNT(*) as count FROM settings").get() as { count: number };
    const settingsJsonPath = path.join(userDataDir, "settings.json");

    if (settingsCountRow.count === 0 && fs.existsSync(settingsJsonPath)) {
      const raw = fs.readFileSync(settingsJsonPath, "utf-8");
      if (raw.trim()) {
        const s = JSON.parse(raw);
        db.prepare(`
          INSERT INTO settings (
            id, max_posts_per_job, confirmation_mode, navigation_timeout_ms,
            action_timeout_ms, max_retries, keep_browser_open_on_finish, updated_at
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          s.maxPostsPerJob ?? 300,
          s.confirmationMode ?? "batch",
          s.navigationTimeoutMs ?? 30000,
          s.actionTimeoutMs ?? 10000,
          s.maxRetries ?? 2,
          s.keepBrowserOpenOnFinish ? 1 : 0,
          new Date().toISOString()
        );
        console.log("[Database] Migrated settings.json into SQLite");
      }
    }
  } catch (err) {
    console.warn("[Database] Migration warning:", (err as Error).message);
  }
}

/**
 * Closes current active database connection (useful for testing).
 */
export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {}
    dbInstance = null;
    currentDbPath = null;
  }
}
