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
  let baseUserDataDir = "";

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
    // Fall back to environment paths
  }

  if (!baseUserDataDir) {
    if (process.env.USER_DATA_DIR) {
      baseUserDataDir = process.env.USER_DATA_DIR;
    } else if (process.platform === "win32" && process.env.APPDATA) {
      baseUserDataDir = path.join(process.env.APPDATA, "x-engagement-assistant");
    } else if (process.platform === "darwin" && process.env.HOME) {
      baseUserDataDir = path.join(process.env.HOME, "Library", "Application Support", "x-engagement-assistant");
    } else if (process.env.HOME) {
      baseUserDataDir = path.join(process.env.HOME, ".config", "x-engagement-assistant");
    } else {
      baseUserDataDir = path.resolve(process.cwd(), "browser-data");
    }
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
