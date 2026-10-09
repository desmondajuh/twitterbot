import { registerBrowserIpc } from "./browser.ipc";
import { registerAutomationIpc } from "./automation.ipc";
import { registerSettingsIpc } from "./settings.ipc";

export function registerAllIpcHandlers(): void {
  registerBrowserIpc();
  registerAutomationIpc();
  registerSettingsIpc();
}
