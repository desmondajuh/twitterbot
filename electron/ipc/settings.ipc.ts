import { ipcMain } from "electron";
import { settingsService } from "../services/settings-service";

export function registerSettingsIpc(): void {
  ipcMain.handle("settings:getPaths", async () => {
    return settingsService.getPaths();
  });
}
