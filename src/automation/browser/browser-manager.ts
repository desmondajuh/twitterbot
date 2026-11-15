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
      viewport: null,
      ignoreDefaultArgs: ["--enable-automation"],
      args: [
        "--disable-blink-features=AutomationControlled",
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
   * Opens (or reuses) the browser window and navigates to X sign-in when not yet authenticated.
   */
  public async launchX(): Promise<{ running: boolean; profilePath: string; isAuthenticated: boolean }> {
    const page = await this.getPage({ headless: false });
    const currentUrl = page.url();
    const isOnX = Boolean(currentUrl && currentUrl !== "about:blank" && currentUrl.includes("x.com"));

    if (!isOnX || (!currentUrl.includes("/i/flow/login") && !(await checkIsAuthenticated(page)))) {
      await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded" }).catch(() => {});
    }

    await page.bringToFront().catch(() => {});
    return this.getStatus();
  }

  /**
   * Clears X/Twitter cookies and site storage so a flagged/stale guest or login session can start fresh.
   */
  public async resetXSession(): Promise<{ running: boolean; profilePath: string; isAuthenticated: boolean }> {
    const context = await this.getContext({ headless: false });
    const page = await this.getPage({ headless: false });

    log("Clearing X/Twitter cookies and site storage for a fresh login session...", "info");

    await context.clearCookies({ domain: /(^|\.)(x|twitter)\.com$/i }).catch(() => {});

    try {
      const cdp = await context.newCDPSession(page);
      for (const origin of ["https://x.com", "https://twitter.com"]) {
        await cdp
          .send("Storage.clearDataForOrigin", {
            origin,
            storageTypes: "all",
          })
          .catch(() => {});
      }
      await cdp.detach().catch(() => {});
    } catch {
      // Ignore if CDP session is unavailable
    }

    await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.bringToFront().catch(() => {});
    return this.getStatus();
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
