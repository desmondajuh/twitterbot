import readline from "node:readline";
import {
  getPersistentBrowserContext,
  checkIsAuthenticated,
  closeBrowserContext,
} from "@/automation/browser";
import { processSinglePostReply } from "@/automation/reply-post";
import { discoverComments } from "@/automation/comments";
import { replyToComment } from "@/automation/reply-to-comment";
import { validateAndParseXPostUrl } from "@/utils/url";
import { log } from "@/automation/logger";
import { XComment } from "@/types";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

const runCLI = async () => {
  console.log("\n=======================================================");
  console.log("   🚀 X (Twitter) Engagement Assistant CLI              ");
  console.log("=======================================================\n");

  try {
    // Step 1: Select Workflow Mode
    console.log("Select Workflow Mode:");
    console.log("  [1] Discover & Reply to Comments under a Post");
    console.log("  [2] Reply to Main Post\n");

    const modeInput = await askQuestion("Enter choice (1/2): ");
    const isCommentWorkflow = modeInput.trim() === "1";

    // Step 2: Launch Persistent Browser Context
    log("Initializing persistent Chromium browser profile...");
    const context = await getPersistentBrowserContext({ headless: false });
    const page = context.pages()[0] || (await context.newPage());

    // Step 3: Verify X Auth Status
    log("Opening X (x.com) to verify authentication session...");
    await page.goto("https://x.com", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3000);

    const isAuthed = await checkIsAuthenticated(page);
    if (!isAuthed) {
      console.log("\n-------------------------------------------------------");
      console.log("⚠️  You are NOT authenticated with X.");
      console.log("Please log in manually in the opened browser window.");
      console.log("📌 TIP: Sign in using your direct X Username/Email and Password.");
      console.log("After completing login, press ENTER in this console.");
      console.log("-------------------------------------------------------\n");
      await askQuestion("Press [ENTER] after logging into X in the browser: ");
    } else {
      log("Authenticated session detected successfully!");
    }

    if (isCommentWorkflow) {
      await handleCommentWorkflow(page);
    } else {
      await handleMainPostWorkflow(page);
    }
  } catch (err) {
    log(`Fatal CLI error: ${(err as Error).message}`, "error");
  } finally {
    await closeBrowserContext();
    rl.close();
  }
};

/**
 * Handles the Comment Discovery and Selective Replying Workflow.
 */

async function handleCommentWorkflow(page: any) {
  console.log("\n-------------------------------------------------------");
  console.log("  💬 WORKFLOW: DISCOVER & REPLY TO COMMENTS");
  console.log("-------------------------------------------------------\n");

  // 1. Prompt for Target Post URL
  let postUrl = "";
  while (!postUrl) {
    const input = await askQuestion("Enter X Post URL (e.g. https://x.com/user/status/123456): ");
    const parsed = validateAndParseXPostUrl(input);
    if (parsed.valid && parsed.normalizedUrl) {
      postUrl = parsed.normalizedUrl;
    } else {
      console.log(`❌ Error: ${parsed.error || "Invalid URL"}. Please try again.`);
    }
  }

  // 2. Prompt for Excluded / Blacklisted Usernames
  const excludedInput = await askQuestion(
    "Usernames to NEVER reply to / mandatorily uncheck (e.g. @baduser1, @baduser2 or press ENTER to skip): "
  );
  const excludedUsernames = excludedInput
    .split(",")
    .map((u) => u.trim().replace(/^@/, ""))
    .filter(Boolean);

  if (excludedUsernames.length > 0) {
    console.log(`📌 Blacklisted Usernames: ${excludedUsernames.map((u) => `@${u}`).join(", ")}`);
  }

  // 3. Prompt for Discovery Limit
  const limitInput = await askQuestion("Max comments to discover (default: 20, max: 100): ");
  const maxComments = Math.min(Math.max(parseInt(limitInput.trim(), 10) || 20, 1), 100);

  // 4. Run Comment Discovery
  console.log(`\n🔍 Discovering up to ${maxComments} comments under post...`);
  const discoveryResult = await discoverComments(page, postUrl, {
    maxComments,
    excludedUsernames,
  });

  const comments = discoveryResult.comments;
  if (!comments || comments.length === 0) {
    console.log("\n⚠️ No comments were found under this post.");
    return;
  }

  console.log("\n=======================================================");
  console.log(`              DISCOVERED COMMENTS (${comments.length})            `);
  console.log("=======================================================");
  comments.forEach((c, idx) => {
    const snippet = c.text.length > 70 ? `${c.text.substring(0, 70)}...` : c.text;
    console.log(`[${idx + 1}] @${c.authorUsername}`);
    console.log(`    "${snippet}"\n`);
  });
  console.log("=======================================================\n");

  // 4. Select Comments to Reply To
  let selectedComments: XComment[] = [];
  while (selectedComments.length === 0) {
    const selectionInput = await askQuestion(
      "Enter comment numbers to reply to (e.g. 1,3,5 or 'all'): "
    );

    const trimmed = selectionInput.trim().toLowerCase();
    if (trimmed === "all") {
      selectedComments = [...comments];
    } else {
      const parts = trimmed.split(",").map((p) => parseInt(p.trim(), 10)).filter(Boolean);
      selectedComments = parts
        .map((num) => comments[num - 1])
        .filter((c): c is XComment => Boolean(c));

      if (selectedComments.length === 0) {
        console.log("❌ Invalid selection. Please enter valid comment numbers or 'all'.");
      }
    }
  }

  // 5. Prompt for Reply Message
  let replyText = "";
  while (!replyText) {
    const input = await askQuestion("Enter Reply Message: ");
    const trimmed = input.trim();
    if (!trimmed) {
      console.log("❌ Error: Reply message cannot be empty.");
    } else if (trimmed.length > 280) {
      console.log(`❌ Error: Message length is ${trimmed.length}/280 characters. Limit is 280.`);
    } else {
      replyText = trimmed;
    }
  }

  // 6. Confirmation Mode
  console.log("\nSelect Confirmation Mode:");
  console.log("  [1] Safe Mode (per-comment confirmation before submitting)");
  console.log("  [2] Batch Mode (process all selected comments automatically)\n");
  const modeChoice = await askQuestion("Enter choice (1/2, default 1): ");
  const isBatchMode = modeChoice.trim() === "2";

  // 7. Preview Screen
  console.log("\n=======================================================");
  console.log("            PREVIEW COMMENT REPLIES QUEUE              ");
  console.log("=======================================================");
  console.log(`Target Post URL: ${postUrl}`);
  console.log(`Selected Comments: ${selectedComments.length}`);
  console.log(`Confirmation Mode: ${isBatchMode ? "Batch Mode" : "Safe Mode (Per-Comment)"}`);
  console.log(`Reply Message (${replyText.length}/280 chars):`);
  console.log(`"${replyText}"`);
  console.log("-------------------------------------------------------");
  selectedComments.forEach((c, idx) => {
    console.log(`  ${idx + 1}. @${c.authorUsername}: "${c.text.substring(0, 50)}..."`);
  });
  console.log("=======================================================\n");

  const confirmStart = await askQuestion("Start processing comment replies queue? [y/N]: ");
  if (confirmStart.trim().toLowerCase() !== "y") {
    log("Operation cancelled by user.", "warn");
    return;
  }

  // 8. Process Comment Replies Sequentially
  console.log("\n-------------------------------------------------------");
  console.log("  🚀 EXECUTING COMMENT REPLY QUEUE");
  console.log("-------------------------------------------------------\n");

  const results: Array<{ author: string; status: string; error?: string }> = [];

  for (let i = 0; i < selectedComments.length; i++) {
    const comment = selectedComments[i];
    console.log(`\n[Item ${i + 1}/${selectedComments.length}] Processing comment by @${comment.authorUsername}...`);

    let skipConfirm = isBatchMode;

    const res = await replyToComment(page, {
      comment,
      replyMessage: replyText,
      jobId: `cli_cmt_${Date.now()}_${i + 1}`,
      skipConfirmation: skipConfirm,
      excludedUsernames,
      onConfirmationRequired: async (details) => {
        console.log("\n-------------------------------------------------------");
        console.log("🔍 SAFE MODE HUMAN CONFIRMATION");
        console.log(`Author:  @${details.authorUsername}`);
        console.log(`Comment: "${details.commentText}"`);
        console.log(`Reply:   "${details.replyMessage}"`);
        console.log("-------------------------------------------------------");

        const choice = await askQuestion(
          "Options: [1] Submit Reply  [2] Skip Comment  [3] Stop Automation\nEnter choice (1/2/3): "
        );

        if (choice.trim() === "2") return "skip";
        if (choice.trim() === "3") return "stop";
        return "submit";
      },
    });

    results.push({
      author: comment.authorUsername,
      status: res.status,
      error: res.error,
    });

    console.log(`Result: ${res.status.toUpperCase()}`);
    if (res.error) {
      console.log(`Error:  ${res.error}`);
    }

    if (res.status === "failed" && res.error?.includes("CANCELLED_BY_USER")) {
      console.log("\n⚠️ Queue stopped by user.");
      break;
    }

    // Anti-detection pause between comments
    if (i < selectedComments.length - 1) {
      const delay = Math.floor(Math.random() * 3000) + 3000;
      console.log(`Pausing ${(delay / 1000).toFixed(1)}s before next comment...`);
      await page.waitForTimeout(delay);
    }
  }

  // 9. Output Final Summary Table
  console.log("\n=======================================================");
  console.log("            COMMENT REPLIES EXECUTION RESULTS          ");
  console.log("=======================================================");
  results.forEach((r, idx) => {
    const symbol = r.status === "success" ? "✓" : r.status === "skipped" ? "—" : "✕";
    console.log(`${symbol} [${idx + 1}] @${r.author}: ${r.status.toUpperCase()}${r.error ? ` (${r.error})` : ""}`);
  });
  console.log("=======================================================\n");
}

/**
 * Handles the Main Post Replying Workflow.
 */
async function handleMainPostWorkflow(page: any) {
  console.log("\n-------------------------------------------------------");
  console.log("  📝 WORKFLOW: REPLY TO MAIN POST");
  console.log("-------------------------------------------------------\n");

  // Step 1: Prompt for Target Post URL
  let postUrl = "";
  while (!postUrl) {
    const input = await askQuestion("Enter X Post URL (e.g. https://x.com/user/status/123456): ");
    const parsed = validateAndParseXPostUrl(input);
    if (parsed.valid && parsed.normalizedUrl) {
      postUrl = parsed.normalizedUrl;
    } else {
      console.log(`❌ Error: ${parsed.error || "Invalid URL"}. Please try again.`);
    }
  }

  // Step 2: Prompt for Reply Message
  let replyText = "";
  while (!replyText) {
    const input = await askQuestion("Enter Reply Message: ");
    const trimmed = input.trim();
    if (!trimmed) {
      console.log("❌ Error: Reply message cannot be empty.");
    } else if (trimmed.length > 280) {
      console.log(`❌ Error: Message length is ${trimmed.length}/280 characters. Limit is 280.`);
    } else {
      replyText = trimmed;
    }
  }

  // Step 3: Display Preview Screen
  console.log("\n=======================================================");
  console.log("               PREVIEW BEFORE EXECUTION                ");
  console.log("=======================================================");
  console.log(`Post URL: ${postUrl}`);
  console.log(`Reply Message (${replyText.length}/280 chars):`);
  console.log(`"${replyText}"`);
  console.log("=======================================================\n");

  const confirmStart = await askQuestion("Start processing this post? [y/N]: ");
  if (confirmStart.trim().toLowerCase() !== "y") {
    log("Operation cancelled by user.", "warn");
    return;
  }

  // Step 4: Process Single Post
  log("Processing post automation...");
  const result = await processSinglePostReply(page, {
    postUrl,
    replyMessage: replyText,
    skipConfirmation: false,
    onConfirmationRequired: async (details) => {
      console.log("\n-------------------------------------------------------");
      console.log("🔍 SAFE MODE HUMAN CONFIRMATION");
      console.log(`Post: ${details.postUrl}`);
      console.log(`Reply: "${details.replyMessage}"`);
      console.log("-------------------------------------------------------");

      const choice = await askQuestion(
        "Options: [1] Submit Reply  [2] Skip Post  [3] Stop Automation\nEnter choice (1/2/3): "
      );

      if (choice.trim() === "2") return "skip";
      if (choice.trim() === "3") return "stop";
      return "submit";
    },
  });

  // Step 5: Output Results Summary
  console.log("\n=======================================================");
  console.log("                 EXECUTION RESULTS                     ");
  console.log("=======================================================");
  console.log(`Status:  ${result.status.toUpperCase()}`);
  console.log(`Post URL: ${result.postUrl}`);
  if (result.error) {
    console.log(`Error:   ${result.error}`);
  }
  if (result.screenshotPath) {
    console.log(`Debug Screenshot: ${result.screenshotPath}`);
  }
  console.log("=======================================================\n");
}

runCLI();
