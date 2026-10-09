import { ipcMain } from "electron";
import { browserService } from "../services/browser-service";

export function registerBrowserIpc(): void {
  ipcMain.handle("browser:connect", async () => {
    return browserService.launchX();
  });

  ipcMain.handle("browser:launch-x", async () => {
    return browserService.launchX();
  });

  ipcMain.handle("browser:disconnect", async () => {
    return browserService.disconnect();
  });

  ipcMain.handle("browser:status", async () => {
    return browserService.getStatus();
  });
}
