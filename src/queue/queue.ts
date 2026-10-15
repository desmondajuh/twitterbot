import {
  AutomationJob,
  ReplyJobItem,
  CreateJobInput,
  ConfirmationMode,
} from "../types";
import { validateAndParseXPostUrl } from "../utils/url";
import { CreateJobSchema } from "../validation";
import { JobsRepository, jobsRepository } from "../db/jobs-repository";

export class JobQueueManager {
  private repository: JobsRepository;

  constructor(repository?: JobsRepository) {
    this.repository = repository || jobsRepository;
  }

  /**
   * Creates a new multi-post automation job backed by SQLite.
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

    return this.repository.saveJob(job);
  }

  /**
   * Retrieves a job by ID from SQLite.
   */
  getJob(jobId: string): AutomationJob | undefined {
    return this.repository.getJob(jobId);
  }

  /**
   * Lists all jobs sorted by creation date descending.
   */
  getAllJobs(): AutomationJob[] {
    return this.repository.getAllJobs();
  }

  /**
   * Deletes a job by ID with cascading deletion of its items.
   */
  deleteJob(jobId: string): boolean {
    return this.repository.deleteJob(jobId);
  }

  /**
   * Updates an item's status and recomputes aggregate counters in SQLite.
   */
  updateItemStatus(
    jobId: string,
    itemId: string,
    status: ReplyJobItem["status"],
    error?: string,
    screenshotPath?: string
  ): AutomationJob | undefined {
    return this.repository.updateItemStatus(jobId, itemId, status, error, screenshotPath);
  }

  /**
   * Updates overall job status.
   */
  updateJobStatus(
    jobId: string,
    status: AutomationJob["status"]
  ): AutomationJob | undefined {
    return this.repository.updateJobStatus(jobId, status);
  }

  /**
   * Resets failed and skipped items back to pending state for job retries.
   */
  resetFailedItems(jobId: string): AutomationJob | undefined {
    return this.repository.resetFailedItems(jobId);
  }

  /**
   * Clears all jobs.
   */
  clearAllJobs(): void {
    this.repository.clearAllJobs();
  }
}

// Global singleton to survive HMR in dev
const globalForQueue = globalThis as unknown as { jobQueue: JobQueueManager };
export const jobQueue = globalForQueue.jobQueue || new JobQueueManager();
if (process.env.NODE_ENV !== "production") globalForQueue.jobQueue = jobQueue;
