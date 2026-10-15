import fs from "node:fs";
import { shell } from "electron";
import { RuntimeConfig } from "../config/runtime-config";
import { AppPaths } from "../../src/types/electron";
import { AutomationSettings } from "../../src/types";
import { settingsRepository } from "../../src/db/settings-repository";

export class SettingsService {
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
      return settingsRepository.getSettings();
    } catch (err) {
      console.warn("Failed to read settings from database:", (err as Error).message);
      return {
        maxPostsPerJob: 300,
        confirmationMode: "batch",
        navigationTimeoutMs: 30000,
        actionTimeoutMs: 10000,
        maxRetries: 2,
        keepBrowserOpenOnFinish: false,
      };
    }
  }

  public async updateSettings(partial: Partial<AutomationSettings>): Promise<AutomationSettings> {
    try {
      return settingsRepository.updateSettings(partial);
    } catch (err) {
      console.error("Failed to save settings to database:", (err as Error).message);
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
