import { Page } from "playwright";
import { jobQueue } from "./queue";
import { AutomationJob, ReplyJobItem } from "../types";
import { getPersistentBrowserContext, closeBrowserContext } from "../automation/browser";
import { processSinglePostReply } from "../automation/reply-post";
import { replyToComment } from "../automation/reply-to-comment";
import { log } from "../automation/logger";

export interface ProcessorOptions {
  onProgress?: (job: AutomationJob, currentItem?: ReplyJobItem) => void;
  onConfirmationRequired?: (item: ReplyJobItem) => Promise<"submit" | "skip" | "stop">;
  keepBrowserOpenOnFinish?: boolean;
  maxRetries?: number;
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
}

export class JobProcessor {
  private isProcessing = false;
  private stopRequested = false;
  private currentJobId: string | null = null;

  /**
   * Request immediate safe stop of automation queue.
   */
  requestStop(): void {
    log("Stop signal received. Halting new job items...", "warn", this.currentJobId || undefined);
    this.stopRequested = true;
    if (this.currentJobId) {
      jobQueue.updateJobStatus(this.currentJobId, "stopped");
    }
  }

  isStopped(): boolean {
    return this.stopRequested;
  }

  /**
   * Processes an automation job sequentially item by item.
   */
  async processJob(jobId: string, options: ProcessorOptions = {}): Promise<AutomationJob> {
    const job = jobQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (this.isProcessing) {
      throw new Error("Processor is currently executing another job");
    }

    this.isProcessing = true;
    this.stopRequested = false;
    this.currentJobId = jobId;
    jobQueue.updateJobStatus(jobId, "running");
    log(`Started execution of job ${jobId} with ${job.totalItems} items. Mode: ${job.confirmationMode}`, "info", jobId);

    let page: Page | null = null;
    const maxRetries = options.maxRetries ?? 2;

    try {
      const context = await getPersistentBrowserContext({ headless: false });
      page = context.pages()[0] || (await context.newPage());

      for (let i = 0; i < job.items.length; i++) {
        const item = job.items[i];

        // Skip items that have already completed successfully (e.g. during retries)
        if (item.status === "success") {
          log(`Item ${item.id} already succeeded. Skipping re-execution.`, "info", jobId);
          continue;
        }

        // Check if stop requested before starting item
        if (this.stopRequested) {
          log(`Skipping item ${item.id} due to stop request.`, "warn", jobId);
          jobQueue.updateItemStatus(jobId, item.id, "skipped", "Automation stopped by user");
          continue;
        }

        jobQueue.updateItemStatus(jobId, item.id, "processing");
        if (options.onProgress) options.onProgress(job, item);

        // Per-post confirmation mode check
        if (job.confirmationMode === "per-post" && options.onConfirmationRequired) {
          log(`Waiting for human confirmation for item ${i + 1}/${job.totalItems}...`, "info", jobId);
          const decision = await options.onConfirmationRequired(item);

          if (decision === "skip") {
            log(`Item ${item.id} skipped by user.`, "warn", jobId);
            jobQueue.updateItemStatus(jobId, item.id, "skipped", "Skipped by user confirmation");
            if (options.onProgress) options.onProgress(job, item);
            continue;
          }

          if (decision === "stop") {
            log(`User requested queue stop during item ${item.id}.`, "warn", jobId);
            this.stopRequested = true;
            jobQueue.updateItemStatus(jobId, item.id, "skipped", "Queue stopped by user");
            // Mark remaining non-success items as skipped
            for (let j = i + 1; j < job.items.length; j++) {
              if (job.items[j].status !== "success") {
                jobQueue.updateItemStatus(jobId, job.items[j].id, "skipped", "Queue stopped by user");
              }
            }
            break;
          }
        }

        // Retry loop for transient failures and rate-limit exponential backoff
        let attempt = 0;
        let result;
        if (job.type === "comment_reply" && item.comment) {
          result = await replyToComment(page, {
            comment: item.comment,
            replyMessage: item.reply,
            jobId: `${jobId}_${i + 1}`,
            skipConfirmation: true,
            excludedUsernames: job.excludedUsernames || [],
            navigationTimeoutMs: options.navigationTimeoutMs,
            actionTimeoutMs: options.actionTimeoutMs,
          });
        } else {
          result = await processSinglePostReply(page, {
            postUrl: item.postUrl,
            replyMessage: item.reply,
            jobId: `${jobId}_${i + 1}`,
            skipConfirmation: true,
            excludedUsernames: job.excludedUsernames || [],
            navigationTimeoutMs: options.navigationTimeoutMs,
            actionTimeoutMs: options.actionTimeoutMs,
          });
        }

        while (!result.success && result.status === "failed" && attempt < maxRetries && !this.stopRequested) {
          attempt++;
          const isRateLimited =
            result.error?.includes("RATE_LIMIT_EXCEEDED") ||
            result.error?.toLowerCase().includes("rate limit");

          const backoffDelay = isRateLimited ? 20000 * attempt : 3000;
          log(
            `Attempt ${attempt}/${maxRetries} failed for item ${item.id}. ${
              isRateLimited ? "Rate limit detected! " : ""
            }Backing off for ${(backoffDelay / 1000).toFixed(0)}s before retry...`,
            "warn",
            jobId
          );

          await page.waitForTimeout(backoffDelay);
          if (job.type === "comment_reply" && item.comment) {
            result = await replyToComment(page, {
              comment: item.comment,
              replyMessage: item.reply,
              jobId: `${jobId}_${i + 1}_retry${attempt}`,
              skipConfirmation: true,
              excludedUsernames: job.excludedUsernames || [],
              navigationTimeoutMs: options.navigationTimeoutMs,
              actionTimeoutMs: options.actionTimeoutMs,
            });
          } else {
            result = await processSinglePostReply(page, {
              postUrl: item.postUrl,
              replyMessage: item.reply,
              jobId: `${jobId}_${i + 1}_retry${attempt}`,
              skipConfirmation: true,
              excludedUsernames: job.excludedUsernames || [],
              navigationTimeoutMs: options.navigationTimeoutMs,
              actionTimeoutMs: options.actionTimeoutMs,
            });
          }
        }

        // Update item status based on result
        jobQueue.updateItemStatus(
          jobId,
          item.id,
          result.status,
          result.error,
          result.screenshotPath
        );

        if (options.onProgress) options.onProgress(job, item);

        // Inter-post anti-detection randomized pause (3.5s to 7.5s delay)
        if (i < job.items.length - 1 && !this.stopRequested) {
          const humanDelayMs = Math.floor(Math.random() * 4000) + 3500;
          log(`Pausing ${(humanDelayMs / 1000).toFixed(1)}s between posts (humanized jitter)...`, "info", jobId);
          await page.waitForTimeout(humanDelayMs);
        }
      }

      const finalStatus: AutomationJob["status"] = this.stopRequested
        ? "stopped"
        : "completed";

      jobQueue.updateJobStatus(jobId, finalStatus);
      log(`Job ${jobId} execution finished with status: ${finalStatus}`, "info", jobId);
      return jobQueue.getJob(jobId)!;
    } catch (err) {
      log(`Critical processor error in job ${jobId}: ${(err as Error).message}`, "error", jobId);
      jobQueue.updateJobStatus(jobId, "failed");
      throw err;
    } finally {
      this.isProcessing = false;
      this.currentJobId = null;
      if (!options.keepBrowserOpenOnFinish) {
        await closeBrowserContext();
      }
    }
  }
}
