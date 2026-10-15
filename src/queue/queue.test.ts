import { describe, it, expect, beforeEach } from "vitest";
import { JobQueueManager } from "./queue";
import { JobsRepository } from "../db/jobs-repository";
import { getDb } from "../db";

describe("Job Queue & State Management", () => {
  let jobQueue: JobQueueManager;

  beforeEach(() => {
    const memDb = getDb(":memory:");
    const repo = new JobsRepository(memDb);
    jobQueue = new JobQueueManager(repo);
  });

  it("should create a new job with valid URLs and reply message", () => {
    const urls = [
      "https://x.com/user1/status/1000000000000000001",
      "https://twitter.com/user2/status/1000000000000000002?s=20",
    ];
    const reply = "Test reply message";

    const job = jobQueue.createJob({
      urls,
      reply,
      confirmationMode: "batch",
    });

    expect(job.id).toBeDefined();
    expect(job.status).toBe("pending");
    expect(job.totalItems).toBe(2);
    expect(job.items.length).toBe(2);
    expect(job.items[0].postId).toBe("1000000000000000001");
    expect(job.items[1].postId).toBe("1000000000000000002");
    expect(job.confirmationMode).toBe("batch");
  });

  it("should reject creating job with invalid URLs", () => {
    expect(() => {
      jobQueue.createJob({
        urls: ["invalid-url"],
        reply: "Hello",
      });
    }).toThrow();
  });

  it("should update item and job status accurately", () => {
    const job = jobQueue.createJob({
      urls: ["https://x.com/user1/status/1111111111111111111"],
      reply: "Valid message",
    });

    const item = job.items[0];
    jobQueue.updateJobStatus(job.id, "running");
    expect(jobQueue.getJob(job.id)?.status).toBe("running");

    jobQueue.updateItemStatus(job.id, item.id, "success");
    const updatedJob = jobQueue.getJob(job.id);
    expect(updatedJob?.successfulItems).toBe(1);
    expect(updatedJob?.items[0].status).toBe("success");
  });

  it("should delete job and update list", () => {
    const job = jobQueue.createJob({
      urls: ["https://x.com/user1/status/2222222222222222222"],
      reply: "To be deleted",
    });

    expect(jobQueue.getJob(job.id)).toBeDefined();
    const deleted = jobQueue.deleteJob(job.id);
    expect(deleted).toBe(true);
    expect(jobQueue.getJob(job.id)).toBeUndefined();
  });

  it("should support large comment reply batches (e.g. 300 comments) and default to batch mode", () => {
    const urls = Array.from({ length: 300 }, (_, i) => `https://x.com/user/status/1000000000000000${String(i).padStart(3, "0")}`);
    const reply = "Bulk educational engagement response";

    const job = jobQueue.createJob({
      urls,
      reply,
    });

    expect(job.id).toBeDefined();
    expect(job.totalItems).toBe(300);
    expect(job.items.length).toBe(300);
    expect(job.confirmationMode).toBe("batch");
  });

  it("should reject creating job exceeding 500 URLs", () => {
    const urls = Array.from({ length: 501 }, (_, i) => `https://x.com/user/status/1000000000000000${String(i).padStart(3, "0")}`);
    expect(() => {
      jobQueue.createJob({
        urls,
        reply: "Bulk reply",
      });
    }).toThrow(/Maximum 500 post URLs allowed per job/);
  });
});
