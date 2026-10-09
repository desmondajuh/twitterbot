import path from "node:path";
import fs from "node:fs";

/**
 * Resolves the bundled Chromium executable path if running inside a packaged app,
 * or returns undefined to fall back to system/playwright default installation.
 */
export function getChromiumExecutablePath(): string | undefined {
  const isPackaged = process.env.NODE_ENV === "production" || !(process as any).defaultApp;
  
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
    return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  }

  // Check process.resourcesPath if running inside Electron
  const resourcesPath = (process as any).resourcesPath;
  if (!resourcesPath) {
    return undefined;
  }

  const platform = process.platform;
  let candidatePath = "";

  if (platform === "win32") {
    candidatePath = path.join(resourcesPath, "chromium", "chrome-win", "chrome.exe");
  } else if (platform === "darwin") {
    // macOS Apple Silicon or Intel
    candidatePath = path.join(
      resourcesPath,
      "chromium",
      "chrome-mac",
      "Chromium.app",
      "Contents",
      "MacOS",
      "Chromium"
    );
  } else {
    candidatePath = path.join(resourcesPath, "chromium", "chrome-linux", "chrome");
  }

  if (fs.existsSync(candidatePath)) {
    return candidatePath;
  }

  return undefined;
}
