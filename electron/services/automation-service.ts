import { BrowserWindow } from "electron";
import { browserManager } from "../../src/automation/browser/browser-manager";
import { discoverComments } from "../../src/automation/comments";
import { jobQueue } from "../../src/queue/queue";
import { JobProcessor } from "../../src/queue/processor";
import {
  DiscoverCommentsOptions,
  AutomationEventStatus,
} from "../../src/types/electron";
import { CreateJobInput, AutomationJob, CommentDiscoveryResult } from "../../src/types";
import { addLogListener, AutomationLog } from "../../src/automation/logger";

export class AutomationService {
  private activeProcessors: Map<string, JobProcessor> = new Map();

  constructor() {
    // Listen to internal log output and forward to Electron windows
    addLogListener((entry: AutomationLog) => {
      this.broadcastLog({
        timestamp: entry.timestamp.toISOString(),
        message: entry.message,
        level: entry.level,
        jobId: entry.jobId,
      });
    });
  }

  private broadcastStatus(jobId: string | undefined, state: AutomationEventStatus, detail?: string) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send("automation:status-change", { jobId, state, detail });
      }
    }
  }

  private broadcastLog(logMsg: { timestamp: string; message: string; level: "info" | "warn" | "error"; jobId?: string }) {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send("automation:log", logMsg);
      }
    }
  }

  public async discoverComments(options: DiscoverCommentsOptions): Promise<CommentDiscoveryResult> {
    this.broadcastStatus(undefined, "browser_starting", "Opening Playwright browser...");
    const page = await browserManager.getPage({ headless: false });

    this.broadcastStatus(undefined, "discovering_comments", `Discovering comments on ${options.postUrl}...`);
    const result = await discoverComments(page, options.postUrl, {
      maxComments: options.maxComments,
      maxScrolls: options.maxScrolls,
      excludedUsernames: options.excludedUsernames,
    });

    this.broadcastStatus(undefined, "comments_ready", `Discovered ${result.comments.length} comments.`);
    return result;
  }

  public async createReplyJob(input: CreateJobInput): Promise<{ jobId: string; job: AutomationJob }> {
    const commentUrls = input.urls.map((u) => {
      let url = u.trim();
      if (!url.startsWith("http")) {
        url = `https://x.com${url.startsWith("/") ? "" : "/"}${url}`;
      }
      return url;
    });

    const job = jobQueue.createJob({
      urls: commentUrls,
      reply: input.reply,
      confirmationMode: input.confirmationMode === "batch" ? "batch" : "per-post",
      type: input.type || "comment_reply",
      comments: input.comments,
      excludedUsernames: input.excludedUsernames || [],
    });

    const processor = new JobProcessor();
    this.activeProcessors.set(job.id, processor);

    this.broadcastStatus(job.id, "starting", `Job ${job.id} created.`);

    // Trigger async job processing
    processor
      .processJob(job.id, {
        keepBrowserOpenOnFinish: false,
        onProgress: (currentJob, item) => {
          this.broadcastStatus(
            currentJob.id,
            currentJob.status === "running" ? "entering_reply" : (currentJob.status as any),
            item ? `Processing item ${item.postUrl}` : undefined
          );
        },
      })
      .then((updatedJob) => {
        this.broadcastStatus(job.id, updatedJob.status === "completed" ? "success" : (updatedJob.status as any));
      })
      .catch((err) => {
        this.broadcastStatus(job.id, "failed", err.message);
      })
      .finally(() => {
        this.activeProcessors.delete(job.id);
      });

    return { jobId: job.id, job };
  }

  public async stopJob(jobId: string): Promise<void> {
    const processor = this.activeProcessors.get(jobId);
    if (processor) {
      processor.requestStop();
      this.broadcastStatus(jobId, "stopped", "Stop requested by user.");
    }
  }

  public async getJob(jobId: string): Promise<AutomationJob | undefined> {
    return jobQueue.getJob(jobId);
  }

  public async getAllJobs(): Promise<AutomationJob[]> {
    return jobQueue.getAllJobs();
  }

  public async retryJob(jobId: string): Promise<AutomationJob | undefined> {
    const job = jobQueue.resetFailedItems(jobId);
    if (!job) return undefined;

    const processor = new JobProcessor();
    this.activeProcessors.set(job.id, processor);

    processor
      .processJob(job.id, { keepBrowserOpenOnFinish: false })
      .finally(() => {
        this.activeProcessors.delete(job.id);
      });

    return job;
  }
}

export const automationService = new AutomationService();
