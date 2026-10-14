import fs from "node:fs";
import path from "node:path";
import { getStorageDirectories } from "./browser/browser-profile";

export type LogLevel = "info" | "warn" | "error";

export interface AutomationLog {
  timestamp: Date;
  level: LogLevel;
  jobId?: string;
  message: string;
}

export type LogListener = (log: AutomationLog) => void;
const listeners: Set<LogListener> = new Set();

const MAX_LOG_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ARCHIVED_LOGS = 3;

/**
 * Appends log entry to app.log in the user data logs directory with automatic file rotation.
 */
function writeLogToDisk(entry: AutomationLog): void {
  try {
    const { logsDir } = getStorageDirectories();
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const logFilePath = path.join(logsDir, "app.log");

    // Check for rotation if file exceeds limit
    if (fs.existsSync(logFilePath)) {
      const stats = fs.statSync(logFilePath);
      if (stats.size > MAX_LOG_FILE_SIZE) {
        for (let i = MAX_ARCHIVED_LOGS - 1; i >= 1; i--) {
          const oldFile = path.join(logsDir, `app.${i}.log`);
          const newFile = path.join(logsDir, `app.${i + 1}.log`);
          if (fs.existsSync(oldFile)) {
            try {
              if (fs.existsSync(newFile)) fs.unlinkSync(newFile);
              fs.renameSync(oldFile, newFile);
            } catch {}
          }
        }
        const rotatedFirst = path.join(logsDir, "app.1.log");
        try {
          if (fs.existsSync(rotatedFirst)) fs.unlinkSync(rotatedFirst);
          fs.renameSync(logFilePath, rotatedFirst);
        } catch {}
      }
    }

    const isoTime = entry.timestamp.toISOString();
    const line = `[${isoTime}] [${entry.level.toUpperCase()}]${entry.jobId ? ` [Job:${entry.jobId}]` : ""} ${entry.message}\n`;
    fs.appendFileSync(logFilePath, line, "utf-8");
  } catch {
    // Suppress disk write errors to prevent interrupting automation
  }
}

export const getLogFilePath = (): string => {
  try {
    const { logsDir } = getStorageDirectories();
    return path.join(logsDir, "app.log");
  } catch {
    return path.resolve(process.cwd(), "browser-data", "logs", "app.log");
  }
};

export const addLogListener = (listener: LogListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const removeLogListener = (listener: LogListener): void => {
  listeners.delete(listener);
};

export const log = (message: string, level: LogLevel = "info", jobId?: string): AutomationLog => {
  const entry: AutomationLog = {
    timestamp: new Date(),
    level,
    jobId,
    message,
  };

  const timeStr = entry.timestamp.toLocaleTimeString("en-US", { hour12: false });
  const prefix = jobId ? `[${timeStr}] [Job:${jobId}]` : `[${timeStr}]`;

  if (level === "error") {
    console.error(`❌ ${prefix} ${message}`);
  } else if (level === "warn") {
    console.warn(`⚠️  ${prefix} ${message}`);
  } else {
    console.log(`ℹ️  ${prefix} ${message}`);
  }

  // Write to persistent disk log file
  writeLogToDisk(entry);

  listeners.forEach((listener) => {
    try {
      listener(entry);
    } catch {}
  });

  return entry;
};
