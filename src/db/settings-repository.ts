import { DatabaseSync } from "./sqlite";
import { getDb } from "./index";
import { AutomationSettings } from "../types";

export const DEFAULT_SETTINGS: AutomationSettings = {
  maxPostsPerJob: 300,
  confirmationMode: "batch",
  navigationTimeoutMs: 30000,
  actionTimeoutMs: 10000,
  maxRetries: 2,
  keepBrowserOpenOnFinish: false,
};

export class SettingsRepository {
  private db: DatabaseSync;

  constructor(customDb?: DatabaseSync) {
    this.db = customDb || getDb();
  }

  public getSettings(): AutomationSettings {
    const row = this.db.prepare("SELECT * FROM settings WHERE id = 1").get() as any;
    if (!row) {
      // Initialize default settings row
      this.db
        .prepare(`
          INSERT INTO settings (
            id, max_posts_per_job, confirmation_mode, navigation_timeout_ms,
            action_timeout_ms, max_retries, keep_browser_open_on_finish, updated_at
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          DEFAULT_SETTINGS.maxPostsPerJob,
          DEFAULT_SETTINGS.confirmationMode,
          DEFAULT_SETTINGS.navigationTimeoutMs,
          DEFAULT_SETTINGS.actionTimeoutMs,
          DEFAULT_SETTINGS.maxRetries,
          DEFAULT_SETTINGS.keepBrowserOpenOnFinish ? 1 : 0,
          new Date().toISOString()
        );
      return { ...DEFAULT_SETTINGS };
    }

    return {
      maxPostsPerJob: row.max_posts_per_job,
      confirmationMode: row.confirmation_mode as any,
      navigationTimeoutMs: row.navigation_timeout_ms,
      actionTimeoutMs: row.action_timeout_ms,
      maxRetries: row.max_retries,
      keepBrowserOpenOnFinish: Boolean(row.keep_browser_open_on_finish),
    };
  }

  public updateSettings(partial: Partial<AutomationSettings>): AutomationSettings {
    const current = this.getSettings();
    const updated: AutomationSettings = {
      ...current,
      ...partial,
    };

    this.db
      .prepare(`
        INSERT INTO settings (
          id, max_posts_per_job, confirmation_mode, navigation_timeout_ms,
          action_timeout_ms, max_retries, keep_browser_open_on_finish, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          max_posts_per_job = excluded.max_posts_per_job,
          confirmation_mode = excluded.confirmation_mode,
          navigation_timeout_ms = excluded.navigation_timeout_ms,
          action_timeout_ms = excluded.action_timeout_ms,
          max_retries = excluded.max_retries,
          keep_browser_open_on_finish = excluded.keep_browser_open_on_finish,
          updated_at = excluded.updated_at
      `)
      .run(
        updated.maxPostsPerJob,
        updated.confirmationMode,
        updated.navigationTimeoutMs,
        updated.actionTimeoutMs,
        updated.maxRetries,
        updated.keepBrowserOpenOnFinish ? 1 : 0,
        new Date().toISOString()
      );

    return updated;
  }
}

export const settingsRepository = new SettingsRepository();
