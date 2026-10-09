import { chromium, BrowserContext, Page } from "playwright";
import { getStorageDirectories } from "./browser-profile";
import { getChromiumExecutablePath } from "./browser-path";
import { log } from "../logger";
import { checkIsAuthenticated } from "../browser";

export interface BrowserManagerOptions {
  headless?: boolean;
  userDataDir?: string;
  executablePath?: string;
  channel?: "chrome" | "msedge" | "chromium";
}

export class BrowserManager {
  private static instance: BrowserManager;
  private activeContext: BrowserContext | null = null;

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /**
   * Initializes or gets the active persistent browser context.
   */
  public async getContext(options: BrowserManagerOptions = {}): Promise<BrowserContext> {
    if (this.activeContext) {
      return this.activeContext;
    }

    const storage = getStorageDirectories();
    const userDataDir = options.userDataDir || storage.profileDir;
    const headless = options.headless ?? false;
    const bundledExecutablePath = options.executablePath || getChromiumExecutablePath();

    log(`Initializing persistent browser manager context at: ${userDataDir}`);

    const launchOptions: any = {
      headless,
      viewport: { width: 1280, height: 800 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-infobars",
      ],
    };

    if (bundledExecutablePath) {
      launchOptions.executablePath = bundledExecutablePath;
      log(`Using bundled Chromium executable path: ${bundledExecutablePath}`);
    }

    try {
      if (options.channel && options.channel !== "chromium") {
        this.activeContext = await chromium.launchPersistentContext(userDataDir, {
          ...launchOptions,
          channel: options.channel,
        });
      } else {
        try {
          this.activeContext = await chromium.launchPersistentContext(userDataDir, {
            ...launchOptions,
            channel: bundledExecutablePath ? undefined : "chrome",
          });
        } catch {
          this.activeContext = await chromium.launchPersistentContext(userDataDir, launchOptions);
        }
      }
    } catch (err) {
      log(`Launch with channel/custom executable failed, falling back to default Chromium: ${(err as Error).message}`, "warn");
      this.activeContext = await chromium.launchPersistentContext(userDataDir, launchOptions);
    }

    // Anti-detection initialization script
    await this.activeContext.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
      if ((window as any).chrome) {
        (window as any).chrome.runtime = (window as any).chrome.runtime || {};
      }
    });

    this.activeContext.on("close", () => {
      log("Browser context closed", "info");
      this.activeContext = null;
    });

    return this.activeContext;
  }

  /**
   * Returns the active Page or creates a new one.
   */
  public async getPage(options?: BrowserManagerOptions): Promise<Page> {
    const context = await this.getContext(options);
    const pages = context.pages();
    return pages.length > 0 ? pages[0] : await context.newPage();
  }

  /**
   * Checks if browser context is currently active.
   */
  public isRunning(): boolean {
    return this.activeContext !== null;
  }

  /**
   * Gets current browser status including authentication check.
   */
  public async getStatus(): Promise<{ running: boolean; profilePath: string; isAuthenticated: boolean }> {
    const storage = getStorageDirectories();
    if (!this.activeContext) {
      return {
        running: false,
        profilePath: storage.profileDir,
        isAuthenticated: false,
      };
    }

    try {
      const page = await this.getPage();
      const authenticated = await checkIsAuthenticated(page);
      return {
        running: true,
        profilePath: storage.profileDir,
        isAuthenticated: authenticated,
      };
    } catch {
      return {
        running: true,
        profilePath: storage.profileDir,
        isAuthenticated: false,
      };
    }
  }

  /**
   * Closes browser context safely.
   */
  public async close(): Promise<void> {
    if (this.activeContext) {
      log("BrowserManager closing active browser context...");
      await this.activeContext.close();
      this.activeContext = null;
    }
  }
}

export const browserManager = BrowserManager.getInstance();
