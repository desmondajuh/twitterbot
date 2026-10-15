import { DatabaseSync } from "./sqlite";
import { getDb } from "./index";
import { AutomationJob, ReplyJobItem, OverallJobStatus, PostJobStatus, ConfirmationMode } from "../types";

export class JobsRepository {
  private db: DatabaseSync;

  constructor(customDb?: DatabaseSync) {
    this.db = customDb || getDb();
  }

  /**
   * Maps a raw SQL row and its items to an AutomationJob.
   */
  private rowToJob(jobRow: any, itemsRows: any[]): AutomationJob {
    const items: ReplyJobItem[] = itemsRows.map((item) => ({
      id: item.id,
      jobId: item.job_id,
      postUrl: item.post_url,
      postId: item.post_id,
      username: item.username || undefined,
      reply: item.reply,
      status: item.status as PostJobStatus,
      error: item.error || undefined,
      screenshotPath: item.screenshot_path || undefined,
      startedAt: item.started_at ? new Date(item.started_at) : undefined,
      completedAt: item.completed_at ? new Date(item.completed_at) : undefined,
      comment: item.comment_data ? JSON.parse(item.comment_data) : undefined,
      excludedUsernames: item.excluded_usernames ? JSON.parse(item.excluded_usernames) : undefined,
    }));

    return {
      id: jobRow.id,
      type: jobRow.type as any,
      status: jobRow.status as OverallJobStatus,
      reply: jobRow.reply,
      totalItems: jobRow.total_items,
      successfulItems: jobRow.successful_items,
      failedItems: jobRow.failed_items,
      skippedItems: jobRow.skipped_items,
      items,
      confirmationMode: jobRow.confirmation_mode as ConfirmationMode,
      createdAt: new Date(jobRow.created_at),
      startedAt: jobRow.started_at ? new Date(jobRow.started_at) : undefined,
      completedAt: jobRow.completed_at ? new Date(jobRow.completed_at) : undefined,
      excludedUsernames: jobRow.excluded_usernames ? JSON.parse(jobRow.excluded_usernames) : undefined,
    };
  }

  /**
   * Persists a newly created job and all its items into SQLite in a single transaction.
   */
  public saveJob(job: AutomationJob): AutomationJob {
    this.db.exec("BEGIN TRANSACTION;");
    try {
      const insertJob = this.db.prepare(`
        INSERT INTO jobs (
          id, type, status, reply, total_items, successful_items, failed_items,
          skipped_items, confirmation_mode, created_at, started_at, completed_at, excluded_usernames
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertJob.run(
        job.id,
        job.type || "post_reply",
        job.status,
        job.reply,
        job.totalItems,
        job.successfulItems,
        job.failedItems,
        job.skippedItems,
        job.confirmationMode,
        job.createdAt.toISOString(),
        job.startedAt ? job.startedAt.toISOString() : null,
        job.completedAt ? job.completedAt.toISOString() : null,
        job.excludedUsernames ? JSON.stringify(job.excludedUsernames) : null
      );

      const insertItem = this.db.prepare(`
        INSERT INTO job_items (
          id, job_id, post_url, post_id, username, reply, status, error,
          screenshot_path, started_at, completed_at, comment_data, excluded_usernames, item_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      job.items.forEach((item, idx) => {
        insertItem.run(
          item.id,
          job.id,
          item.postUrl,
          item.postId,
          item.username || null,
          item.reply,
          item.status,
          item.error || null,
          item.screenshotPath || null,
          item.startedAt ? item.startedAt.toISOString() : null,
          item.completedAt ? item.completedAt.toISOString() : null,
          item.comment ? JSON.stringify(item.comment) : null,
          item.excludedUsernames ? JSON.stringify(item.excludedUsernames) : null,
          idx
        );
      });

      this.db.exec("COMMIT;");
      return job;
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  /**
   * Retrieves a job and all its associated items.
   */
  public getJob(jobId: string): AutomationJob | undefined {
    const jobRow = this.db.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId);
    if (!jobRow) return undefined;

    const itemsRows = this.db
      .prepare("SELECT * FROM job_items WHERE job_id = ? ORDER BY item_order ASC")
      .all(jobId);

    return this.rowToJob(jobRow, itemsRows);
  }

  /**
   * Lists all jobs ordered by creation date descending.
   */
  public getAllJobs(): AutomationJob[] {
    const jobRows = this.db.prepare("SELECT * FROM jobs ORDER BY created_at DESC").all();
    if (jobRows.length === 0) return [];

    const getItems = this.db.prepare("SELECT * FROM job_items WHERE job_id = ? ORDER BY item_order ASC");
    return jobRows.map((jobRow) => {
      const itemsRows = getItems.all(jobRow.id);
      return this.rowToJob(jobRow, itemsRows);
    });
  }

  /**
   * Updates an item's status and recomputes the job's progress counts.
   */
  public updateItemStatus(
    jobId: string,
    itemId: string,
    status: PostJobStatus,
    error?: string,
    screenshotPath?: string
  ): AutomationJob | undefined {
    const existing = this.getJob(jobId);
    if (!existing) return undefined;

    const completedAtIso = ["success", "failed", "skipped"].includes(status)
      ? new Date().toISOString()
      : null;
    const startedAtIso = status === "processing" ? new Date().toISOString() : null;

    this.db.exec("BEGIN TRANSACTION;");
    try {
      this.db
        .prepare(`
          UPDATE job_items
          SET status = ?,
              error = COALESCE(?, error),
              screenshot_path = COALESCE(?, screenshot_path),
              started_at = COALESCE(?, started_at),
              completed_at = COALESCE(?, completed_at)
          WHERE id = ? AND job_id = ?
        `)
        .run(status, error || null, screenshotPath || null, startedAtIso, completedAtIso, itemId, jobId);

      // Recompute counters from database
      const counts = this.db
        .prepare(`
          SELECT
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
          FROM job_items WHERE job_id = ?
        `)
        .get(jobId) as { successful: number | null; failed: number | null; skipped: number | null };

      this.db
        .prepare(`
          UPDATE jobs
          SET successful_items = ?,
              failed_items = ?,
              skipped_items = ?
          WHERE id = ?
        `)
        .run(counts.successful || 0, counts.failed || 0, counts.skipped || 0, jobId);

      this.db.exec("COMMIT;");
      return this.getJob(jobId);
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  /**
   * Updates overall job status.
   */
  public updateJobStatus(jobId: string, status: OverallJobStatus): AutomationJob | undefined {
    const job = this.getJob(jobId);
    if (!job) return undefined;

    const startedAtIso = status === "running" && !job.startedAt ? new Date().toISOString() : null;
    const completedAtIso = ["completed", "stopped", "failed"].includes(status)
      ? new Date().toISOString()
      : null;

    this.db
      .prepare(`
        UPDATE jobs
        SET status = ?,
            started_at = COALESCE(?, started_at),
            completed_at = COALESCE(?, completed_at)
        WHERE id = ?
      `)
      .run(status, startedAtIso, completedAtIso, jobId);

    return this.getJob(jobId);
  }

  /**
   * Resets failed and skipped items back to pending state for retrying a job.
   */
  public resetFailedItems(jobId: string): AutomationJob | undefined {
    const job = this.getJob(jobId);
    if (!job) return undefined;

    this.db.exec("BEGIN TRANSACTION;");
    try {
      this.db
        .prepare(`
          UPDATE job_items
          SET status = 'pending',
              error = NULL,
              screenshot_path = NULL,
              started_at = NULL,
              completed_at = NULL
          WHERE job_id = ? AND status IN ('failed', 'skipped')
        `)
        .run(jobId);

      // Recompute counters
      const counts = this.db
        .prepare(`
          SELECT
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped
          FROM job_items WHERE job_id = ?
        `)
        .get(jobId) as { successful: number | null; failed: number | null; skipped: number | null };

      this.db
        .prepare(`
          UPDATE jobs
          SET status = 'pending',
              successful_items = ?,
              failed_items = ?,
              skipped_items = ?
          WHERE id = ?
        `)
        .run(counts.successful || 0, counts.failed || 0, counts.skipped || 0, jobId);

      this.db.exec("COMMIT;");
      return this.getJob(jobId);
    } catch (err) {
      this.db.exec("ROLLBACK;");
      throw err;
    }
  }

  /**
   * Deletes a job (cascades to job items automatically).
   */
  public deleteJob(jobId: string): boolean {
    const result = this.db.prepare("DELETE FROM jobs WHERE id = ?").run(jobId);
    return Number(result.changes) > 0;
  }

  /**
   * Clears all jobs from database.
   */
  public clearAllJobs(): void {
    this.db.exec("DELETE FROM jobs;");
  }
}

export const jobsRepository = new JobsRepository();
