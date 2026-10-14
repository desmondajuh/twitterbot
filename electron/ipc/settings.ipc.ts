import { ipcMain } from "electron";
import { settingsService } from "../services/settings-service";
import { AutomationSettings } from "../../src/types";

export function registerSettingsIpc(): void {
  ipcMain.handle("settings:getPaths", async () => {
    return settingsService.getPaths();
  });

  ipcMain.handle("settings:get", async () => {
    return settingsService.getSettings();
  });

  ipcMain.handle("settings:update", async (_event, partial: Partial<AutomationSettings>) => {
    return settingsService.updateSettings(partial);
  });

  ipcMain.handle("settings:openFolder", async (_event, target: "logs" | "screenshots" | "userData" | "browserProfile") => {
    return settingsService.openFolder(target);
  });
}
