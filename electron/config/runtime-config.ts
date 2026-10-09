import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

export class RuntimeConfig {
  public static get isDevelopment(): boolean {
    return !app.isPackaged;
  }

  public static getUserDataPath(): string {
    return app.getPath("userData");
  }

  public static getProfilePath(): string {
    const profilePath = path.join(this.getUserDataPath(), "browser-profile");
    if (!fs.existsSync(profilePath)) {
      fs.mkdirSync(profilePath, { recursive: true });
    }
    return profilePath;
  }

  public static getLogsPath(): string {
    const logsPath = path.join(this.getUserDataPath(), "logs");
    if (!fs.existsSync(logsPath)) {
      fs.mkdirSync(logsPath, { recursive: true });
    }
    return logsPath;
  }

  public static getScreenshotsPath(): string {
    const screenshotsPath = path.join(this.getUserDataPath(), "screenshots");
    if (!fs.existsSync(screenshotsPath)) {
      fs.mkdirSync(screenshotsPath, { recursive: true });
    }
    return screenshotsPath;
  }

  /**
   * Resolves the packaged Playwright Chromium executable path if bundled,
   * or returns undefined to let Playwright use its default location.
   */
  public static getChromiumExecutablePath(): string | undefined {
    if (this.isDevelopment) {
      return undefined;
    }

    const resourcesPath = (process as any).resourcesPath || process.cwd();
    const platform = process.platform;

    let candidatePath = "";
    if (platform === "win32") {
      candidatePath = path.join(
        resourcesPath,
        "chromium",
        "chrome-win",
        "chrome.exe"
      );
    } else if (platform === "darwin") {
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
      candidatePath = path.join(
        resourcesPath,
        "chromium",
        "chrome-linux",
        "chrome"
      );
    }

    if (fs.existsSync(candidatePath)) {
      return candidatePath;
    }

    return undefined;
  }
}
