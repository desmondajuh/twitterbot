import fs from "node:fs";
import path from "node:path";
import { shell } from "electron";
import { RuntimeConfig } from "../config/runtime-config";
import { AppPaths } from "../../src/types/electron";
import { AutomationSettings } from "../../src/types";

export const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  maxPostsPerJob: 20,
  confirmationMode: "per-post",
  navigationTimeoutMs: 30000,
  actionTimeoutMs: 10000,
  maxRetries: 2,
  keepBrowserOpenOnFinish: false,
};

export class SettingsService {
  private getSettingsFilePath(): string {
    return path.join(RuntimeConfig.getUserDataPath(), "settings.json");
  }

  public async getPaths(): Promise<AppPaths> {
    return {
      userData: RuntimeConfig.getUserDataPath(),
      logs: RuntimeConfig.getLogsPath(),
      screenshots: RuntimeConfig.getScreenshotsPath(),
      browserProfile: RuntimeConfig.getProfilePath(),
    };
  }

  public async getSettings(): Promise<AutomationSettings> {
    try {
      const filePath = this.getSettingsFilePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_AUTOMATION_SETTINGS, ...parsed };
      }
    } catch (err) {
      console.warn("Failed to read settings from disk:", (err as Error).message);
    }
    return { ...DEFAULT_AUTOMATION_SETTINGS };
  }

  public async updateSettings(partial: Partial<AutomationSettings>): Promise<AutomationSettings> {
    try {
      const current = await this.getSettings();
      const updated: AutomationSettings = {
        ...current,
        ...partial,
      };

      const filePath = this.getSettingsFilePath();
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");
      return updated;
    } catch (err) {
      console.error("Failed to save settings to disk:", (err as Error).message);
      throw err;
    }
  }

  public async openFolder(target: "logs" | "screenshots" | "userData" | "browserProfile"): Promise<boolean> {
    try {
      const paths = await this.getPaths();
      const targetPath = paths[target] || paths.userData;
      if (fs.existsSync(targetPath)) {
        await shell.openPath(targetPath);
        return true;
      }
      return false;
    } catch (err) {
      console.warn("Failed to open folder:", (err as Error).message);
      return false;
    }
  }
}

export const settingsService = new SettingsService();
