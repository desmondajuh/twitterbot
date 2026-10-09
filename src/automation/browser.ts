import { BrowserContext, Page } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { log } from "./logger";
import { xSelectors } from "./x-selectors";
import { browserManager, BrowserManagerOptions } from "./browser/browser-manager";
import { getStorageDirectories } from "./browser/browser-profile";

export interface BrowserOptions extends BrowserManagerOptions {}

/**
 * Creates or reuses a persistent Playwright Chromium browser context.
 * Preserves X login cookies and local storage across runs.
 */
export const getPersistentBrowserContext = async (
  options: BrowserOptions = {}
): Promise<BrowserContext> => {
  return browserManager.getContext(options);
};

/**
 * Checks if the currently active page/session is authenticated on X.
 */
export const checkIsAuthenticated = async (page: Page): Promise<boolean> => {
  try {
    // Check if account switcher or profile link is visible
    const accountSwitcher = page.locator(xSelectors.auth.accountSwitcher);
    const profileNav = page.locator(xSelectors.auth.profileNav);
    const loginBtn = page.locator(xSelectors.auth.loginButton);

    const isLoggedIn =
      (await accountSwitcher.count()) > 0 || (await profileNav.count()) > 0;
    const isLoggedOut = (await loginBtn.count()) > 0;

    if (isLoggedIn) return true;
    if (isLoggedOut) return false;

    // Fallback: Check cookies for 'auth_token' or 'twid'
    const cookies = await page.context().cookies("https://x.com");
    const hasAuthCookie = cookies.some(
      (c) => c.name === "auth_token" || c.name === "twid"
    );

    return hasAuthCookie;
  } catch {
    return false;
  }
};

/**
 * Captures a debug screenshot on failure.
 */
export const captureDebugScreenshot = async (
  page: Page,
  jobId: string
): Promise<string | undefined> => {
  try {
    const { debugDir } = getStorageDirectories();

    const filename = `job-${jobId}-${Date.now()}-error.png`;
    const filePath = path.join(debugDir, filename);
    await page.screenshot({ path: filePath, fullPage: false });
    log(`Debug screenshot captured: ${filePath}`, "warn", jobId);
    return filePath;
  } catch (err) {
    log(`Failed to capture screenshot: ${(err as Error).message}`, "error", jobId);
    return undefined;
  }
};

/**
 * Closes active persistent browser context cleanly.
 */
export const closeBrowserContext = async (): Promise<void> => {
  await browserManager.close();
};
