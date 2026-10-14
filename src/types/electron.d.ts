import { AutomationJob, CreateJobInput, CommentDiscoveryResult, XComment, AutomationSettings } from "./index";

export interface BrowserStatus {
  running: boolean;
  profilePath: string;
  isAuthenticated: boolean;
}

export interface DiscoverCommentsOptions {
  postUrl: string;
  maxComments?: number;
  maxScrolls?: number;
  excludedUsernames?: string[];
}

export interface AppPaths {
  userData: string;
  logs: string;
  screenshots: string;
  browserProfile: string;
}

export interface LogMessage {
  timestamp: string;
  message: string;
  level: "info" | "warn" | "error";
  jobId?: string;
}

export type AutomationEventStatus =
  | "idle"
  | "starting"
  | "browser_starting"
  | "authenticated"
  | "discovering_comments"
  | "comments_ready"
  | "verifying_target"
  | "configuring_recipient"
  | "entering_reply"
  | "ready_to_submit"
  | "submitting"
  | "success"
  | "failed"
  | "stopped";

export type ConfirmationDecision = "submit" | "skip" | "stop";

export interface ConfirmationRequest {
  confirmationId: string;
  jobId: string;
  itemId: string;
  postUrl: string;
  postId: string;
  username?: string;
  replyMessage: string;
  comment?: XComment;
}

export interface DesktopAPI {
  isElectron: boolean;
  browser: {
    connect: () => Promise<BrowserStatus>;
    launchX: () => Promise<BrowserStatus>;
    disconnect: () => Promise<void>;
    getStatus: () => Promise<BrowserStatus>;
  };
  automation: {
    discoverComments: (options: DiscoverCommentsOptions) => Promise<CommentDiscoveryResult>;
    createReplyJob: (input: CreateJobInput) => Promise<{ jobId: string; job: AutomationJob }>;
    stopJob: (jobId: string) => Promise<void>;
    getJob: (jobId: string) => Promise<AutomationJob | undefined>;
    getAllJobs: () => Promise<AutomationJob[]>;
    retryJob: (jobId: string) => Promise<AutomationJob | undefined>;
    onStatusChange: (callback: (status: { jobId?: string; state: AutomationEventStatus; detail?: string }) => void) => () => void;
    onLog: (callback: (logMsg: LogMessage) => void) => () => void;
    onConfirmRequest: (callback: (request: ConfirmationRequest) => void) => () => void;
    respondConfirm: (confirmationId: string, decision: ConfirmationDecision) => Promise<void>;
  };
  settings: {
    getPaths: () => Promise<AppPaths>;
    getSettings: () => Promise<AutomationSettings>;
    updateSettings: (settings: Partial<AutomationSettings>) => Promise<AutomationSettings>;
    openFolder: (target: "logs" | "screenshots" | "userData" | "browserProfile") => Promise<boolean>;
  };
}

declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
