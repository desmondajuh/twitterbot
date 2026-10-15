import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "./sqlite";
import { getDb } from "./index";
import { JobsRepository } from "./jobs-repository";
import { SettingsRepository } from "./settings-repository";
import { AutomationJob } from "../types";

describe("Embedded SQLite Database", () => {
  let db: DatabaseSync;
  let jobsRepo: JobsRepository;
  let settingsRepo: SettingsRepository;

  beforeEach(() => {
    // Isolated in-memory database for each test
    db = getDb(":memory:");
    jobsRepo = new JobsRepository(db);
    settingsRepo = new SettingsRepository(db);
  });

  it("should create and retrieve a job with items", () => {
    const job: AutomationJob = {
      id: "job_test_1",
      type: "comment_reply",
      status: "pending",
      reply: "Automated test reply",
      totalItems: 2,
      successfulItems: 0,
      failedItems: 0,
      skippedItems: 0,
      confirmationMode: "batch",
      createdAt: new Date(),
      excludedUsernames: ["bot_user"],
      items: [
        {
          id: "item_1",
          jobId: "job_test_1",
          postUrl: "https://x.com/user/status/1001",
          postId: "1001",
          username: "user_a",
          reply: "Automated test reply",
          status: "pending",
        },
        {
          id: "item_2",
          jobId: "job_test_1",
          postUrl: "https://x.com/user/status/1002",
          postId: "1002",
          username: "user_b",
          reply: "Automated test reply",
          status: "pending",
        },
      ],
    };

    jobsRepo.saveJob(job);
    const retrieved = jobsRepo.getJob("job_test_1");

    expect(retrieved).toBeDefined();
    expect(retrieved?.id).toBe("job_test_1");
    expect(retrieved?.type).toBe("comment_reply");
    expect(retrieved?.totalItems).toBe(2);
    expect(retrieved?.items.length).toBe(2);
    expect(retrieved?.items[0].username).toBe("user_a");
    expect(retrieved?.items[1].username).toBe("user_b");
    expect(retrieved?.excludedUsernames).toEqual(["bot_user"]);
  });

  it("should update item status and recalculate aggregate counts", () => {
    const job: AutomationJob = {
      id: "job_test_2",
      type: "post_reply",
      status: "running",
      reply: "Reply test",
      totalItems: 2,
      successfulItems: 0,
      failedItems: 0,
      skippedItems: 0,
      confirmationMode: "batch",
      createdAt: new Date(),
      items: [
        {
          id: "item_2_1",
          jobId: "job_test_2",
          postUrl: "https://x.com/user/status/2001",
          postId: "2001",
          reply: "Reply test",
          status: "pending",
        },
        {
          id: "item_2_2",
          jobId: "job_test_2",
          postUrl: "https://x.com/user/status/2002",
          postId: "2002",
          reply: "Reply test",
          status: "pending",
        },
      ],
    };

    jobsRepo.saveJob(job);

    // Update item 1 to success
    jobsRepo.updateItemStatus("job_test_2", "item_2_1", "success");
    let updated = jobsRepo.getJob("job_test_2");
    expect(updated?.successfulItems).toBe(1);
    expect(updated?.failedItems).toBe(0);

    // Update item 2 to failed with error message
    jobsRepo.updateItemStatus("job_test_2", "item_2_2", "failed", "Rate limited");
    updated = jobsRepo.getJob("job_test_2");
    expect(updated?.successfulItems).toBe(1);
    expect(updated?.failedItems).toBe(1);
    expect(updated?.items[1].error).toBe("Rate limited");
  });

  it("should cascade delete items when a job is deleted", () => {
    const job: AutomationJob = {
      id: "job_test_3",
      status: "pending",
      reply: "To delete",
      totalItems: 1,
      successfulItems: 0,
      failedItems: 0,
      skippedItems: 0,
      confirmationMode: "batch",
      createdAt: new Date(),
      items: [
        {
          id: "item_3_1",
          jobId: "job_test_3",
          postUrl: "https://x.com/user/status/3001",
          postId: "3001",
          reply: "To delete",
          status: "pending",
        },
      ],
    };

    jobsRepo.saveJob(job);
    expect(jobsRepo.getJob("job_test_3")).toBeDefined();

    const deleted = jobsRepo.deleteJob("job_test_3");
    expect(deleted).toBe(true);
    expect(jobsRepo.getJob("job_test_3")).toBeUndefined();

    // Verify items table is empty
    const itemsCount = db.prepare("SELECT COUNT(*) as count FROM job_items WHERE job_id = ?").get("job_test_3") as { count: number };
    expect(itemsCount.count).toBe(0);
  });

  it("should reset failed items for retry", () => {
    const job: AutomationJob = {
      id: "job_test_4",
      status: "failed",
      reply: "Retry test",
      totalItems: 2,
      successfulItems: 1,
      failedItems: 1,
      skippedItems: 0,
      confirmationMode: "batch",
      createdAt: new Date(),
      items: [
        {
          id: "item_4_1",
          jobId: "job_test_4",
          postUrl: "https://x.com/user/status/4001",
          postId: "4001",
          reply: "Retry test",
          status: "success",
        },
        {
          id: "item_4_2",
          jobId: "job_test_4",
          postUrl: "https://x.com/user/status/4002",
          postId: "4002",
          reply: "Retry test",
          status: "failed",
          error: "Network timeout",
        },
      ],
    };

    jobsRepo.saveJob(job);
    const reset = jobsRepo.resetFailedItems("job_test_4");

    expect(reset?.status).toBe("pending");
    expect(reset?.failedItems).toBe(0);
    expect(reset?.successfulItems).toBe(1);
    expect(reset?.items[1].status).toBe("pending");
    expect(reset?.items[1].error).toBeUndefined();
  });

  it("should manage system settings in SQLite", () => {
    const initial = settingsRepo.getSettings();
    expect(initial.maxPostsPerJob).toBe(300);
    expect(initial.confirmationMode).toBe("batch");

    const updated = settingsRepo.updateSettings({
      maxPostsPerJob: 150,
      keepBrowserOpenOnFinish: true,
    });

    expect(updated.maxPostsPerJob).toBe(150);
    expect(updated.keepBrowserOpenOnFinish).toBe(true);

    // Fetch freshly from database
    const fresh = settingsRepo.getSettings();
    expect(fresh.maxPostsPerJob).toBe(150);
    expect(fresh.keepBrowserOpenOnFinish).toBe(true);
  });
});
