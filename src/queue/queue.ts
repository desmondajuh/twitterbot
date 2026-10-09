import {
  AutomationJob,
  ReplyJobItem,
  CreateJobInput,
  ConfirmationMode,
} from "../types";
import { validateAndParseXPostUrl } from "../utils/url";
import { CreateJobSchema } from "../validation";

class JobQueueManager {
  private jobs: Map<string, AutomationJob> = new Map();

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
    }

    return job;
  }
}

const globalForQueue = globalThis as unknown as { jobQueue: JobQueueManager };
export const jobQueue = globalForQueue.jobQueue || new JobQueueManager();
if (process.env.NODE_ENV !== "production") globalForQueue.jobQueue = jobQueue;
