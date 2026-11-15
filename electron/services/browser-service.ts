import { browserManager } from "../../src/automation/browser/browser-manager";
import { BrowserStatus } from "../../src/types/electron";

export class BrowserService {
  public async connect(): Promise<BrowserStatus> {
    const page = await browserManager.getPage({ headless: false });
    return browserManager.getStatus();
  }

  public async launchX(): Promise<BrowserStatus> {
    return browserManager.launchX();
  }

  public async resetXSession(): Promise<BrowserStatus> {
    return browserManager.resetXSession();
  }

  public async disconnect(): Promise<void> {
    await browserManager.close();
  }

  public async getStatus(): Promise<BrowserStatus> {
    return browserManager.getStatus();
  }
}

export const browserService = new BrowserService();
