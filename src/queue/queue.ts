import fs from "node:fs";
import path from "node:path";
import {
  AutomationJob,
  ReplyJobItem,
  CreateJobInput,
  ConfirmationMode,
} from "../types";
import { validateAndParseXPostUrl } from "../utils/url";
import { CreateJobSchema } from "../validation";
import { getStorageDirectories } from "../automation/browser/browser-profile";

class JobQueueManager {
  private jobs: Map<string, AutomationJob> = new Map();
  private storageFilePath: string;

  constructor() {
    try {
      const { userDataDir } = getStorageDirectories();
      this.storageFilePath = path.join(userDataDir, "jobs.json");
      this.loadFromDisk();
    } catch {
      this.storageFilePath = path.resolve(process.cwd(), "browser-data", "jobs.json");
      this.loadFromDisk();
    }
  }

  /**
   * Loads persisted jobs from disk and restores Date instances.
   */
  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(this.storageFilePath)) {
        return;
      }
      const raw = fs.readFileSync(this.storageFilePath, "utf-8");
      if (!raw.trim()) return;

      const parsed: any[] = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      for (const item of parsed) {
        if (!item || !item.id) continue;

        const job: AutomationJob = {
          ...item,
          createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
          startedAt: item.startedAt ? new Date(item.startedAt) : undefined,
          completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
          items: Array.isArray(item.items)
            ? item.items.map((i: any) => ({
                ...i,
                startedAt: i.startedAt ? new Date(i.startedAt) : undefined,
                completedAt: i.completedAt ? new Date(i.completedAt) : undefined,
              }))
            : [],
        };
        this.jobs.set(job.id, job);
      }
    } catch (err) {
      console.warn("Failed to load jobs from disk:", (err as Error).message);
    }
  }

  /**
   * Persists the current in-memory job list to disk.
   */
  private persist(): void {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.jobs.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), "utf-8");
    } catch (err) {
      console.error("Failed to persist jobs to disk:", (err as Error).message);
    }
  }

  /**
   * Creates a new multi-post automation job.
   */
  createJob(input: CreateJobInput): AutomationJob {
    const validated = CreateJobSchema.parse(input);
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const jobType = input.type || "post_reply";

    const items: ReplyJobItem[] = validated.urls.map((url, idx) => {
      const parsed = validateAndParseXPostUrl(url);
      const commentObj = input.comments ? input.comments[idx] : undefined;
      return {
        id: `${jobId}_item_${idx + 1}`,
        jobId,
        postUrl: parsed.normalizedUrl || url.trim(),
        postId: parsed.postId || `unknown_${idx}`,
        username: parsed.username || commentObj?.authorUsername,
        reply: validated.reply,
        status: "pending",
        comment: commentObj,
      };
    });

    const job: AutomationJob = {
      id: jobId,
      type: jobType,
      status: "pending",
      reply: validated.reply,
      totalItems: items.length,
      successfulItems: 0,
      failedItems: 0,
      skippedItems: 0,
      items,
      confirmationMode: validated.confirmationMode as ConfirmationMode,
      createdAt: new Date(),
      excludedUsernames: validated.excludedUsernames || input.excludedUsernames || [],
    };

    this.jobs.set(jobId, job);
    this.persist();
    return job;
  }

  /**
   * Retrieves a job by ID.
   */
  getJob(jobId: string): AutomationJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Lists all jobs sorted by creation date descending.
   */
  getAllJobs(): AutomationJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  /**
   * Deletes a job by ID.
   */
  deleteJob(jobId: string): boolean {
    const deleted = this.jobs.delete(jobId);
    if (deleted) {
      this.persist();
    }
    return deleted;
  }

  /**
   * Updates job state or item status.
   */
  updateItemStatus(
    jobId: string,
    itemId: string,
    status: ReplyJobItem["status"],
    error?: string,
    screenshotPath?: string
  ): AutomationJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    const item = job.items.find((i) => i.id === itemId);
    if (!item) return undefined;

    item.status = status;
    if (error) item.error = error;
    if (screenshotPath) item.screenshotPath = screenshotPath;

    if (status === "processing") {
      item.startedAt = new Date();
    } else if (status === "success" || status === "failed" || status === "skipped") {
      item.completedAt = new Date();
    }

    // Recompute counts
    job.successfulItems = job.items.filter((i) => i.status === "success").length;
    job.failedItems = job.items.filter((i) => i.status === "failed").length;
    job.skippedItems = job.items.filter((i) => i.status === "skipped").length;

    this.persist();
    return job;
  }

  /**
   * Updates overall job status.
   */
  updateJobStatus(
    jobId: string,
    status: AutomationJob["status"]
  ): AutomationJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.status = status;
    if (status === "running" && !job.startedAt) {
      job.startedAt = new Date();
    } else if (
      status === "completed" ||
      status === "stopped" ||
      status === "failed"
    ) {
      job.completedAt = new Date();
    }

    this.persist();
    return job;
  }

  /**
   * Resets failed and skipped items back to pending state for job retries.
   */
  resetFailedItems(jobId: string): AutomationJob | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    let resetCount = 0;
    for (const item of job.items) {
      if (item.status === "failed" || item.status === "skipped") {
        item.status = "pending";
        item.error = undefined;
        item.screenshotPath = undefined;
        item.startedAt = undefined;
        item.completedAt = undefined;
        resetCount++;
      }
    }

    if (resetCount > 0) {
      job.status = "pending";
      job.failedItems = job.items.filter((i) => i.status === "failed").length;
      job.skippedItems = job.items.filter((i) => i.status === "skipped").length;
      this.persist();
    }

    return job;
  }
}

const globalForQueue = globalThis as unknown as { jobQueue: JobQueueManager };
export const jobQueue = globalForQueue.jobQueue || new JobQueueManager();
if (process.env.NODE_ENV !== "production") globalForQueue.jobQueue = jobQueue;
