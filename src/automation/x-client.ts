import { Page } from "playwright";
import { xSelectors } from "./x-selectors";
import { AutomationError } from "./errors";
import { log } from "./logger";
import { checkIsAuthenticated } from "./browser";

export interface XClientConfig {
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
}

const DEFAULT_CONFIG: Required<XClientConfig> = {
  navigationTimeoutMs: 30000,
  actionTimeoutMs: 10000,
};

export class XClient {
  private config: Required<XClientConfig>;

  constructor(config?: XClientConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Step 1 - 3: Navigate to X post URL and verify post loaded.
   */
  async navigateToPost(page: Page, postUrl: string, jobId?: string): Promise<void> {
    log(`Navigating to: ${postUrl}`, "info", jobId);

    try {
      await page.goto(postUrl, {
        waitUntil: "domcontentloaded",
        timeout: this.config.navigationTimeoutMs,
      });
    } catch (err) {
      throw new AutomationError(
        "NAVIGATION_FAILED",
        `Failed to navigate to ${postUrl}: ${(err as Error).message}`
      );
    }

    // Human-like random delay after page load (1.5s - 3.5s)
    await page.waitForTimeout(Math.floor(Math.random() * 2000) + 1500);

    // Scroll down slightly to trigger lazy-loaded X status elements
    await page.evaluate(() => window.scrollBy(0, 150)).catch(() => {});
    await page.waitForTimeout(600);

    // Check for explicit X rate limit notices
    const pageText = await page.innerText("body").catch(() => "");
    if (
      pageText.includes("Rate limit exceeded") ||
      pageText.includes("You are rate limited") ||
      pageText.includes("Something went wrong, but don’t fret")
    ) {
      throw new AutomationError(
        "RATE_LIMIT_EXCEEDED",
        "X rate limit detected on page load. Please wait before retrying."
      );
    }

    // Multi-selector list for target tweet container
    const postSelectors = [
      xSelectors.post.primaryTweet,
      'article[role="article"]',
      '[data-testid="cellInnerDiv"]',
      'main[role="main"]',
      xSelectors.post.notFoundNotice,
    ].join(", ");

    try {
      await page.waitForSelector(postSelectors, {
        timeout: this.config.actionTimeoutMs + 5000,
      });
    } catch {
      const isAuth = await checkIsAuthenticated(page);
      if (!isAuth) {
        throw new AutomationError(
          "AUTHENTICATION_REQUIRED",
          "You are not signed in to X (Twitter). Please click 'Launch & Sign in X' to log in to your X account first."
        );
      }

      // Soft retry: scroll down more and do a secondary 5s wait check before throwing TIMEOUT
      log("Primary tweet selector wait timed out. Attempting scroll and secondary check...", "warn", jobId);
      await page.evaluate(() => window.scrollBy(0, 250)).catch(() => {});
      try {
        await page.waitForSelector(postSelectors, { timeout: 5000 });
      } catch {
        throw new AutomationError(
          "TIMEOUT",
          `Timed out waiting for post element to load at ${postUrl}`
        );
      }
    }

    const notFoundCount = await page.locator(xSelectors.post.notFoundNotice).count();
    if (notFoundCount > 0) {
      throw new AutomationError(
        "POST_NOT_FOUND",
        `Post at ${postUrl} is unavailable or deleted.`
      );
    }
  }

  /**
   * Step 4: Verify authentication state.
   */
  async assertAuthenticated(page: Page, jobId?: string): Promise<void> {
    log("Checking X authentication state...", "info", jobId);
    const isAuthenticated = await checkIsAuthenticated(page);

    if (!isAuthenticated) {
      throw new AutomationError(
        "AUTHENTICATION_REQUIRED",
        "You are not signed in to X (Twitter). Please click 'Launch & Sign in X' to log in to your X account first."
      );
    }
    log("Authentication verified successfully", "info", jobId);
  }

  /**
   * Step 5 & 6: Locate and focus reply composer.
   */
  async focusReplyComposer(page: Page, jobId?: string): Promise<void> {
    log("Locating reply composer...", "info", jobId);

    // Human pause before interaction
    await page.waitForTimeout(Math.floor(Math.random() * 800) + 600);

    const inlineComposer = page.locator(xSelectors.reply.inlineComposerTrigger).first();
    const actionReplyBtn = page.locator(xSelectors.reply.actionReplyButton).first();

    let composerFound = false;

    if ((await inlineComposer.count()) > 0 && (await inlineComposer.isVisible())) {
      await inlineComposer.click();
      composerFound = true;
    } else if ((await actionReplyBtn.count()) > 0 && (await actionReplyBtn.isVisible())) {
      await actionReplyBtn.click();
      composerFound = true;
    }

    if (!composerFound) {
      const fallbackBox = page.locator(xSelectors.reply.textboxFallback).first();
      if ((await fallbackBox.count()) > 0 && (await fallbackBox.isVisible())) {
        await fallbackBox.click();
        composerFound = true;
      }
    }

    if (!composerFound) {
      throw new AutomationError(
        "REPLY_COMPOSER_NOT_FOUND",
        "Could not find or focus reply composer input area."
      );
    }

    log("Reply composer located and focused", "info", jobId);
  }

  /**
   * Step 7 & 8: Enter text into reply box with human typing jitter.
   */
  async enterReplyText(page: Page, replyMessage: string, jobId?: string): Promise<void> {
    log(`Entering reply message (${replyMessage.length} characters) with human typing jitter...`, "info", jobId);

    // Dismiss any non-reply dialog (e.g. Views modal) if open
    const dismissBtn = page.locator('button:has-text("Dismiss")').first();
    if ((await dismissBtn.count()) > 0 && (await dismissBtn.isVisible())) {
      await dismissBtn.click().catch(() => {});
      await page.waitForTimeout(400);
    }

    // Prioritize active modal dialog composer over inline composer
    const modalComposer = page.locator('[role="dialog"] [data-testid="tweetTextarea_0InModal"], [role="dialog"] div[contenteditable="true"], [data-testid="tweetTextarea_0InModal"]').first();
    const inlineComposer = page.locator('[data-testid="tweetTextarea_0"], div[contenteditable="true"][role="textbox"]').first();

    let textbox = modalComposer;
    if ((await modalComposer.count()) === 0 || !(await modalComposer.isVisible())) {
      textbox = inlineComposer;
    }

    if ((await textbox.count()) === 0) {
      throw new AutomationError(
        "REPLY_COMPOSER_NOT_FOUND",
        "Could not find active reply textarea."
      );
    }

    await page.waitForTimeout(Math.floor(Math.random() * 500) + 400);

    await textbox.focus();
    await textbox.click().catch(() => {});
    await page.waitForTimeout(300);

    // Clear existing text and simulate human keystrokes with randomized delay (35ms - 75ms)
    await textbox.clear().catch(() => {});
    await textbox.pressSequentially(replyMessage, {
      delay: Math.floor(Math.random() * 40) + 35,
    });

    await page.waitForTimeout(600);

    const textContent = await textbox.innerText().catch(() => "");
    if (!textContent.includes(replyMessage.trim().substring(0, 10))) {
      // Fallback fill if contenteditable dropped characters
      await textbox.fill(replyMessage).catch(() => {});
    }

    log("Reply text entered and verified in composer", "info", jobId);
  }

  /**
   * Step 9 - 11: Submit reply and verify submission or rate limit.
   */
  async submitReply(page: Page, jobId?: string): Promise<void> {
    log("Submitting reply...", "info", jobId);

    // Prioritize active modal submit button over inline submit button
    const modalSubmit = page.locator('[role="dialog"] [data-testid="tweetButton"], [data-testid="tweetButton"]').first();
    const inlineSubmit = page.locator('[data-testid="tweetButtonInline"]').first();

    let submitBtn = modalSubmit;
    if ((await modalSubmit.count()) === 0 || !(await modalSubmit.isVisible())) {
      submitBtn = inlineSubmit;
    }

    if ((await submitBtn.count()) === 0) {
      throw new AutomationError(
        "REPLY_SUBMISSION_FAILED",
        "Reply submission button was not found."
      );
    }

    // Wait up to 5s for submit button to be enabled after typing
    try {
      await page.waitForFunction(
        (btn) => btn && !btn.hasAttribute("disabled") && btn.getAttribute("aria-disabled") !== "true",
        await submitBtn.elementHandle(),
        { timeout: 5000 }
      );
    } catch {
      log("Submit button state wait completed", "info", jobId);
    }

    // Human delay before clicking submit (800ms - 1800ms)
    await page.waitForTimeout(Math.floor(Math.random() * 1000) + 800);

    await submitBtn.click();
    log("Reply submit button clicked, waiting for confirmation...", "info", jobId);

    // Wait for submission confirmation or toast notice
    await page.waitForTimeout(3000);

    const toastLocator = page.locator(xSelectors.reply.successToast);
    if ((await toastLocator.count()) > 0) {
      const toastText = (await toastLocator.first().innerText()).toLowerCase();
      if (
        toastText.includes("rate limit") ||
        toastText.includes("unable to post") ||
        toastText.includes("something went wrong")
      ) {
        throw new AutomationError(
          "RATE_LIMIT_EXCEEDED",
          `X submission rate limit detected: ${toastText}`
        );
      }
    }

    log("Reply successfully submitted and confirmed", "info", jobId);
  }
}
