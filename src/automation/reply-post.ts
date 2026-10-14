import { Page } from "playwright";
import { XClient } from "./x-client";
import { captureDebugScreenshot } from "./browser";
import { AutomationError } from "./errors";
import { log } from "./logger";
import { validateAndParseXPostUrl } from "../utils/url";
import { configureReplyRecipient, canSubmitReply } from "./reply-recipients";

export interface SingleReplyOptions {
  postUrl: string;
  replyMessage: string;
  jobId?: string;
  skipConfirmation?: boolean; // Safe mode vs auto batch submit
  excludedUsernames?: string[];
  navigationTimeoutMs?: number;
  actionTimeoutMs?: number;
  onConfirmationRequired?: (details: {
    postUrl: string;
    postId: string;
    username?: string;
    replyMessage: string;
  }) => Promise<"submit" | "skip" | "stop">;
}

export interface SingleReplyResult {
  success: boolean;
  jobId: string;
  postUrl: string;
  postId?: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  screenshotPath?: string;
}

export const processSinglePostReply = async (
  page: Page,
  options: SingleReplyOptions
): Promise<SingleReplyResult> => {
  const jobId = options.jobId || `job_${Date.now()}`;
  const { postUrl, replyMessage } = options;

  log(`--- Starting single post reply task [Job: ${jobId}] ---`, "info", jobId);

  // Validate URL
  const parsedUrl = validateAndParseXPostUrl(postUrl);
  if (!parsedUrl.valid || !parsedUrl.postId) {
    const errorMsg = parsedUrl.error || "Invalid post URL";
    log(errorMsg, "error", jobId);
    return {
      success: false,
      jobId,
      postUrl,
      status: "failed",
      error: errorMsg,
    };
  }

  // Validate reply message length
  const trimmedReply = replyMessage.trim();
  if (!trimmedReply) {
    return {
      success: false,
      jobId,
      postUrl,
      postId: parsedUrl.postId,
      status: "failed",
      error: "Reply message cannot be empty",
    };
  }

  if (trimmedReply.length > 280) {
    return {
      success: false,
      jobId,
      postUrl,
      postId: parsedUrl.postId,
      status: "failed",
      error: `Reply message exceeds 280 characters limit (${trimmedReply.length}/280)`,
    };
  }

  const client = new XClient({
    navigationTimeoutMs: options.navigationTimeoutMs,
    actionTimeoutMs: options.actionTimeoutMs,
  });

  try {
    // 1. Navigate to Post
    await client.navigateToPost(page, parsedUrl.normalizedUrl || postUrl, jobId);

    // 2. Check Auth
    await client.assertAuthenticated(page, jobId);

    // 3. Focus composer
    await client.focusReplyComposer(page, jobId);

    // 4. Configure Recipient & Enforce Safety Gate (uncheck "Others in this conversation" if in a thread)
    const targetUsername = parsedUrl.username || "author";
    const recipientConfig = await configureReplyRecipient(
      page,
      targetUsername,
      options.excludedUsernames || [],
      jobId
    );
    if (!recipientConfig.success) {
      log(`Recipient configuration failed: ${recipientConfig.errorMessage}`, "error", jobId);
      const screenshotPath = await captureDebugScreenshot(page, `recipient-failure-${jobId}`);
      return {
        success: false,
        jobId,
        postUrl,
        postId: parsedUrl.postId,
        status: "failed",
        error: recipientConfig.error || "RECIPIENT_CONTROL_NOT_FOUND",
        screenshotPath,
      };
    }

    // 5. Enter reply text
    await client.enterReplyText(page, trimmedReply, jobId);

    // 6. Human Confirmation (Safe Mode)
    if (!options.skipConfirmation && options.onConfirmationRequired) {
      log("Pausing for human confirmation before submission...", "info", jobId);

      const decision = await options.onConfirmationRequired({
        postUrl: parsedUrl.normalizedUrl || postUrl,
        postId: parsedUrl.postId,
        username: parsedUrl.username,
        replyMessage: trimmedReply,
      });

      if (decision === "skip") {
        log("Job skipped by user during confirmation.", "warn", jobId);
        return {
          success: false,
          jobId,
          postUrl,
          postId: parsedUrl.postId,
          status: "skipped",
          error: "Skipped by user confirmation",
        };
      }

      if (decision === "stop") {
        log("Automation cancelled by user during confirmation.", "warn", jobId);
        throw new AutomationError("CANCELLED_BY_USER", "Automation stopped by user prompt");
      }
    }

    // 7. Verify Safety Gate
    const canSubmit = await canSubmitReply(page, targetUsername, trimmedReply, jobId);
    if (!canSubmit) {
      log("Safety Gate FAIL: Post reply cannot be submitted safely", "error", jobId);
      const screenshotPath = await captureDebugScreenshot(page, `safety-gate-failed-${jobId}`);
      return {
        success: false,
        jobId,
        postUrl,
        postId: parsedUrl.postId,
        status: "failed",
        error: "TARGET_RECIPIENT_NOT_PRESENT",
        screenshotPath,
      };
    }

    // 8. Submit reply
    await client.submitReply(page, jobId);

    log(`Successfully submitted reply to post ${parsedUrl.postId}`, "info", jobId);

    return {
      success: true,
      jobId,
      postUrl: parsedUrl.normalizedUrl || postUrl,
      postId: parsedUrl.postId,
      status: "success",
    };
  } catch (err) {
    const errorObj = err as Error;
    const errorMsg = errorObj.message;
    log(`Job ${jobId} failed: ${errorMsg}`, "error", jobId);

    // Capture screenshot on error
    const screenshotPath = await captureDebugScreenshot(page, jobId);

    return {
      success: false,
      jobId,
      postUrl,
      postId: parsedUrl.postId,
      status: "failed",
      error: errorMsg,
      screenshotPath,
    };
  }
};
