import path from "node:path";
import fs from "node:fs";

/**
 * Resolves directory paths for browser profile, logs, and screenshots.
 * Uses Electron app.getPath("userData") when running in Electron,
 * or fallback process.cwd() paths when running in standalone Node/CLI.
 */
export function getStorageDirectories(): {
  userDataDir: string;
  profileDir: string;
  logsDir: string;
  debugDir: string;
} {
  let baseUserDataDir = path.resolve(process.cwd(), "browser-data");

  try {
    // If running inside Electron main process or preload context
    if ((process as any).versions?.electron) {
      const electron = eval("require")("electron");
      const app = electron.app || electron.remote?.app;
      if (app && typeof app.getPath === "function") {
        baseUserDataDir = app.getPath("userData");
      }
    }
  } catch {
    // Fall back to local process.cwd() for CLI or non-Electron environments
  }

  const profileDir = path.join(baseUserDataDir, "browser-profile");
  const logsDir = path.join(baseUserDataDir, "logs");
  const debugDir = path.join(baseUserDataDir, "screenshots");

  // Ensure directories exist
  [profileDir, logsDir, debugDir].forEach((dir) => {
    if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) {
      fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
    }
  });

  return {
    userDataDir: baseUserDataDir,
    profileDir,
    logsDir,
    debugDir,
  };
}
