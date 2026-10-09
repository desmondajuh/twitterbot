export type LogLevel = "info" | "warn" | "error";

export interface AutomationLog {
  timestamp: Date;
  level: LogLevel;
  jobId?: string;
  message: string;
}

export type LogListener = (log: AutomationLog) => void;
const listeners: Set<LogListener> = new Set();

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

  listeners.forEach((listener) => {
    try {
      listener(entry);
    } catch {}
  });

  return entry;
};
