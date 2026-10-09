import { RuntimeConfig } from "../config/runtime-config";
import { AppPaths } from "../../src/types/electron";

export class SettingsService {
  public async getPaths(): Promise<AppPaths> {
    return {
      userData: RuntimeConfig.getUserDataPath(),
      logs: RuntimeConfig.getLogsPath(),
      screenshots: RuntimeConfig.getScreenshotsPath(),
      browserProfile: RuntimeConfig.getProfilePath(),
    };
  }
}

export const settingsService = new SettingsService();
