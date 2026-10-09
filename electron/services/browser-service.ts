import { browserManager } from "../../src/automation/browser/browser-manager";
import { BrowserStatus } from "../../src/types/electron";

export class BrowserService {
  public async connect(): Promise<BrowserStatus> {
    const page = await browserManager.getPage({ headless: false });
    return browserManager.getStatus();
  }

  public async launchX(): Promise<BrowserStatus> {
    const page = await browserManager.getPage({ headless: false });
    const currentUrl = page.url();
    if (!currentUrl || currentUrl === "about:blank" || !currentUrl.includes("x.com")) {
      await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded" }).catch(() => {});
    }
    await page.bringToFront().catch(() => {});
    return browserManager.getStatus();
  }

  public async disconnect(): Promise<void> {
    await browserManager.close();
  }

  public async getStatus(): Promise<BrowserStatus> {
    return browserManager.getStatus();
  }
}

export const browserService = new BrowserService();
