import { AutomationJob, CreateJobInput, CommentDiscoveryResult, XComment } from "./index";

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
  };
  settings: {
    getPaths: () => Promise<AppPaths>;
  };
}

declare global {
  interface Window {
    desktop?: DesktopAPI;
  }
}
