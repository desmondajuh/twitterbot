import { Page } from "playwright";
import { XClient } from "./x-client";
import { captureDebugScreenshot } from "./browser";
import { AutomationError } from "./errors";
import { log } from "./logger";
import { validateAndParseXPostUrl } from "../utils/url";

export interface SingleReplyOptions {
  postUrl: string;
  replyMessage: string;
  jobId?: string;
  skipConfirmation?: boolean; // Safe mode vs auto batch submit
  excludedUsernames?: string[];
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

  const client = new XClient();

  try {
    // 1. Navigate to Post
    await client.navigateToPost(page, parsedUrl.normalizedUrl || postUrl, jobId);

    // 2. Check Auth
    await client.assertAuthenticated(page, jobId);

    // 3. Focus composer & enter text
    await client.focusReplyComposer(page, jobId);
    await client.enterReplyText(page, trimmedReply, jobId);

    // 4. Human Confirmation (Safe Mode)
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

    // 5. Submit reply
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
      postUrl: parsedUrl.normalizedUrl || postUrl,
      postId: parsedUrl.postId,
      status: "failed",
      error: errorMsg,
      screenshotPath,
    };
  }
};
