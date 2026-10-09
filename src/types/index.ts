export type PostJobStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "skipped";

export type OverallJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "stopped" | "failed";

export type ConfirmationMode = "per-post" | "batch";

import { XComment } from "./x-comment";

export interface ReplyJobItem {
  id: string;
  jobId: string;
  postUrl: string;
  postId: string;
  username?: string;
  reply: string;
  status: PostJobStatus;
  error?: string;
  screenshotPath?: string;
  startedAt?: Date;
  completedAt?: Date;
  comment?: XComment;
  excludedUsernames?: string[];
}

export interface AutomationJob {
  id: string;
  type?: "post_reply" | "comment_reply";
  status: OverallJobStatus;
  reply: string;
  totalItems: number;
  successfulItems: number;
  failedItems: number;
  skippedItems: number;
  items: ReplyJobItem[];
  confirmationMode: ConfirmationMode;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  excludedUsernames?: string[];
}

export interface AutomationSettings {
  maxPostsPerJob: number;
  confirmationMode: ConfirmationMode;
  navigationTimeoutMs: number;
  actionTimeoutMs: number;
  maxRetries: number;
  keepBrowserOpenOnFinish?: boolean;
}

export interface CreateJobInput {
  urls: string[];
  reply: string;
  confirmationMode?: ConfirmationMode;
  type?: "post_reply" | "comment_reply";
  comments?: XComment[];
  excludedUsernames?: string[];
}

export * from "./x-comment";

