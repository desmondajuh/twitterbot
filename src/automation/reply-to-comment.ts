import { Page } from "playwright";
import { XComment } from "../types";
import { XClient } from "./x-client";
import { captureDebugScreenshot } from "./browser";
import { AutomationError } from "./errors";
import { log } from "./logger";
import { xSelectors } from "./x-selectors";
import { configureReplyRecipient, canSubmitReply } from "./reply-recipients";

export interface CommentReplyOptions {
  comment: XComment;
  replyMessage: string;
  jobId?: string;
  skipConfirmation?: boolean;
  excludedUsernames?: string[];
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
  onConfirmationRequired?: (details: {
    commentId: string;
    authorUsername: string;
    commentText: string;
    replyMessage: string;
  }) => Promise<"submit" | "skip" | "stop">;
}

export interface CommentReplyResult {
  success: boolean;
  jobId: string;
  commentId: string;
  authorUsername: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  screenshotPath?: string;
}

/**
 * Automates replying to a specific selected comment.
 * Ensures the reply targets the comment author and NOT the parent post.
 */
export async function replyToComment(
  page: Page,
  options: CommentReplyOptions
): Promise<CommentReplyResult> {
  const { comment, replyMessage } = options;
  const jobId = options.jobId || `reply_cmt_${Date.now()}`;
  const trimmedReply = replyMessage.trim();

  log(
    `--- Starting comment reply task [Job: ${jobId}] targeting @${comment.authorUsername} (commentId: ${comment.id}) ---`,
    "info",
    jobId
  );

  if (!trimmedReply) {
    return {
      success: false,
      jobId,
      commentId: comment.id,
      authorUsername: comment.authorUsername,
      status: "failed",
      error: "Reply message cannot be empty",
    };
  }

  if (trimmedReply.length > 280) {
    return {
      success: false,
      jobId,
      commentId: comment.id,
      authorUsername: comment.authorUsername,
      status: "failed",
      error: `Reply message exceeds 280 characters limit (${trimmedReply.length}/280)`,
    };
  }

  const client = new XClient({
    navigationTimeoutMs: options.navigationTimeoutMs,
    actionTimeoutMs: options.actionTimeoutMs,
  });

  try {
    // 1. Navigation strategy:
    // If comment.url contains a real numeric status ID, navigate directly to comment.url.
    // Otherwise, navigate to the parent post URL where all thread comments are rendered.
    const hasNumericStatusId =
      comment.id &&
      /^\d+$/.test(comment.id) &&
      !comment.id.startsWith("cmt_") &&
      !comment.id.startsWith("unknown_");

    const targetUrl = hasNumericStatusId && comment.url && comment.url.includes("/status/")
      ? comment.url
      : `https://x.com/i/status/${comment.parentPostId}`;

    log(`Navigating to target post for comment reply: ${targetUrl}`, "info", jobId);
    await client.navigateToPost(page, targetUrl, jobId);
    await client.assertAuthenticated(page, jobId);

    // 2. Locate the specific comment element on page and click reply button
    await page.waitForTimeout(1000);

    let replyButtonClicked = false;
    const cleanUsername = comment.authorUsername.toLowerCase().replace(/^@/, "").split(/\s+/)[0];
    const textSnippet = comment.text ? comment.text.trim().substring(0, 15).toLowerCase() : "";

    const tweetSelector = '[data-testid="tweet"], [role="article"]';

    log(`Searching for comment article by @${cleanUsername} (commentId: ${comment.id})...`, "info", jobId);

    // Strategy 1: Find article by direct status link containing /status/ID
    if (hasNumericStatusId) {
      const statusLink = page.locator(`[data-testid="tweet"] a[href*="/status/${comment.id}"], article a[href*="/status/${comment.id}"], a[href*="/status/${comment.id}"]`).first();
      if ((await statusLink.count()) > 0) {
        const matchingArticle = statusLink.locator('xpath=ancestor::*[@data-testid="tweet" or @role="article"]').first();
        if ((await matchingArticle.count()) > 0) {
          const replyBtn = matchingArticle.locator(xSelectors.reply.actionReplyButton).first();
          if ((await replyBtn.count()) > 0 && (await replyBtn.isVisible())) {
            await matchingArticle.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(400);
            await replyBtn.click();
            replyButtonClicked = true;
            log(`Strategy 1: Clicked reply button for direct status ID ${comment.id}`, "info", jobId);
          }
        }
      }
    }

    // Strategy 2: Search articles in the visible thread for matching author and text
    if (!replyButtonClicked) {
      const articles = page.locator(tweetSelector);
      const articleCount = await articles.count();

      for (let i = 0; i < articleCount; i++) {
        const art = articles.nth(i);
        const userNameElem = art.locator('[data-testid="User-Name"]').first();
        const userText = (await userNameElem.count()) > 0 ? (await userNameElem.innerText()).toLowerCase() : "";
        const artText = (await art.innerText().catch(() => "")).toLowerCase();

        const isAuthorMatch = userText.includes(cleanUsername) || artText.includes(`@${cleanUsername}`);
        const isTextMatch = !textSnippet || artText.includes(textSnippet);

        if (isAuthorMatch && isTextMatch) {
          // Dismiss any accidental Views / Analytics popup if open
          const dismissBtn = page.locator('button:has-text("Dismiss")').first();
          if ((await dismissBtn.count()) > 0 && (await dismissBtn.isVisible())) {
            await dismissBtn.click().catch(() => {});
            await page.waitForTimeout(400);
          }

          const replyBtn = art.locator('[data-testid="reply"]').first();
          if ((await replyBtn.count()) > 0 && (await replyBtn.isVisible())) {
            await art.scrollIntoViewIfNeeded().catch(() => {});
            await page.waitForTimeout(400);
            await replyBtn.click();
            replyButtonClicked = true;
            log(`Strategy 2: Clicked reply button on comment article #${i + 1} for @${cleanUsername}`, "info", jobId);
            break;
          }
        }
      }
    }

    // Strategy 3: Progressive thread scroll to locate comment if not visible initially
    if (!replyButtonClicked) {
      log(`Comment not found in initial view. Progressive scrolling thread...`, "info", jobId);
      for (let scrollIdx = 0; scrollIdx < 4; scrollIdx++) {
        await page.evaluate(() => window.scrollBy(0, 600));
        await page.waitForTimeout(1000);

        const articles = page.locator(tweetSelector);
        const count = await articles.count();
        for (let i = 0; i < count; i++) {
          const art = articles.nth(i);
          const userNameElem = art.locator('[data-testid="User-Name"]').first();
          const userText = (await userNameElem.count()) > 0 ? (await userNameElem.innerText()).toLowerCase() : "";
          const artText = (await art.innerText().catch(() => "")).toLowerCase();

          const isAuthorMatch = userText.includes(cleanUsername) || artText.includes(`@${cleanUsername}`);
          const isTextMatch = !textSnippet || artText.includes(textSnippet);

          if (isAuthorMatch && isTextMatch) {
            const replyBtn = art.locator(xSelectors.reply.actionReplyButton).first();
            if ((await replyBtn.count()) > 0 && (await replyBtn.isVisible())) {
              await art.scrollIntoViewIfNeeded().catch(() => {});
              await page.waitForTimeout(400);
              await replyBtn.click();
              replyButtonClicked = true;
              log(`Strategy 3: Clicked reply button after scroll pass #${scrollIdx + 1} for @${cleanUsername}`, "info", jobId);
              break;
            }
          }
        }
        if (replyButtonClicked) break;
      }
    }

    // Strategy 4: Primary article reply button fallback if opened on a focused comment URL page
    if (!replyButtonClicked && hasNumericStatusId) {
      const primaryArticle = page.locator(tweetSelector).first();
      if ((await primaryArticle.count()) > 0) {
        const replyBtn = primaryArticle.locator(xSelectors.reply.actionReplyButton).first();
        if ((await replyBtn.count()) > 0 && (await replyBtn.isVisible())) {
          await primaryArticle.scrollIntoViewIfNeeded().catch(() => {});
          await page.waitForTimeout(400);
          await replyBtn.click();
          replyButtonClicked = true;
          log("Strategy 4: Clicked reply button on primary focal article", "info", jobId);
        }
      }
    }

    if (!replyButtonClicked) {
      throw new AutomationError(
        "REPLY_COMPOSER_NOT_FOUND",
        `Could not locate or open reply composer for comment by @${comment.authorUsername}`
      );
    }

    // 3. Verify reply composer readiness
    await page.waitForTimeout(600);
    const modalComposer = page.locator('[role="dialog"] [data-testid="tweetTextarea_0InModal"], [role="dialog"] div[contenteditable="true"], [data-testid="tweetTextarea_0InModal"], [data-testid="tweetTextarea_0"]').first();
    if ((await modalComposer.count()) > 0) {
      await modalComposer.waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
    }

    log(`Reply composer ready for comment by @${comment.authorUsername}`, "info", jobId);

    // 4. Configure Recipient & Disable "Others in this conversation" and excluded handles
    const recipientConfig = await configureReplyRecipient(
      page,
      comment.authorUsername,
      options.excludedUsernames || [],
      jobId
    );
    if (!recipientConfig.success) {
      log(`Recipient configuration failed: ${recipientConfig.errorMessage}`, "error", jobId);
      const screenshotPath = await captureDebugScreenshot(page, `recipient-failure-${jobId}`);
      return {
        success: false,
        jobId,
        commentId: comment.id,
        authorUsername: comment.authorUsername,
        status: "failed",
        error: recipientConfig.error || "RECIPIENT_CONTROL_NOT_FOUND",
        screenshotPath,
      };
    }

    // 5. Safe Mode Confirmation Callback
    if (!options.skipConfirmation && options.onConfirmationRequired) {
      log("Pausing for human confirmation before submitting comment reply...", "info", jobId);

      const decision = await options.onConfirmationRequired({
        commentId: comment.id,
        authorUsername: comment.authorUsername,
        commentText: comment.text,
        replyMessage: trimmedReply,
      });

      if (decision === "skip") {
        log(`Comment reply to @${comment.authorUsername} skipped by user.`, "warn", jobId);
        return {
          success: false,
          jobId,
          commentId: comment.id,
          authorUsername: comment.authorUsername,
          status: "skipped",
          error: "Skipped by user confirmation",
        };
      }

      if (decision === "stop") {
        log("Comment reply queue cancelled by user.", "warn", jobId);
        throw new AutomationError("CANCELLED_BY_USER", "Comment reply queue stopped by user prompt");
      }
    }

    // 6. Enter reply text
    await client.enterReplyText(page, trimmedReply, jobId);

    // 7. Final Safety Gate (Section 23 requirement)
    const canSubmit = await canSubmitReply(page, comment.authorUsername, trimmedReply, jobId);
    if (!canSubmit) {
      log("Safety Gate FAIL: Reply cannot be submitted safely", "error", jobId);
      const screenshotPath = await captureDebugScreenshot(page, `safety-gate-failed-${jobId}`);
      return {
        success: false,
        jobId,
        commentId: comment.id,
        authorUsername: comment.authorUsername,
        status: "failed",
        error: "TARGET_RECIPIENT_NOT_PRESENT",
        screenshotPath,
      };
    }

    // 8. Submit reply
    await client.submitReply(page, jobId);

    log(`Successfully submitted reply to comment by @${comment.authorUsername}`, "info", jobId);

    return {
      success: true,
      jobId,
      commentId: comment.id,
      authorUsername: comment.authorUsername,
      status: "success",
    };
  } catch (err) {
    const errorObj = err as Error;
    const errorMsg = errorObj.message;
    log(`Comment reply task failed for @${comment.authorUsername}: ${errorMsg}`, "error", jobId);

    const screenshotPath = await captureDebugScreenshot(page, jobId);

    return {
      success: false,
      jobId,
      commentId: comment.id,
      authorUsername: comment.authorUsername,
      status: "failed",
      error: errorMsg,
      screenshotPath,
    };
  }
}
