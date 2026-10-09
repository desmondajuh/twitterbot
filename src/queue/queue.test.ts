import { describe, it, expect } from "vitest";
import { jobQueue } from "./queue";

describe("Job Queue & State Management", () => {
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
});
