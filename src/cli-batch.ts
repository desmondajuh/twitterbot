import readline from "node:readline";
import { jobQueue } from "@/queue/queue";
import { JobProcessor } from "@/queue/processor";
import { getPersistentBrowserContext, checkIsAuthenticated } from "@/automation/browser";
import { validateAndParseXPostUrl } from "@/utils/url";
import { log } from "@/automation/logger";
import { ConfirmationMode } from "@/types";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const askQuestion = (query: string): Promise<string> => {
  return new Promise((resolve) => rl.question(query, resolve));
};

const runBatchCLI = async () => {
  console.log("\n=======================================================");
  console.log("   🚀 X Engagement Automation CLI — Phase 2 Batch Queue ");
  console.log("=======================================================\n");

  try {
    // 1. Verify Browser & Auth Session
    log("Initializing persistent Chromium browser profile...");
    const context = await getPersistentBrowserContext({ headless: false });
    const page = context.pages()[0] || (await context.newPage());

    log("Opening X (x.com) to verify authentication...");
    await page.goto("https://x.com", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    const isAuthed = await checkIsAuthenticated(page);
    if (!isAuthed) {
      console.log("\n-------------------------------------------------------");
      console.log("⚠️  You are NOT authenticated with X.");
      console.log("Please log in manually using your X Username/Password.");
      console.log("Press [ENTER] after completing login.");
      console.log("-------------------------------------------------------\n");
      await askQuestion("Press [ENTER] after logging into X: ");
    } else {
      log("Authenticated session detected!");
    }

    // 2. Input Multiple URLs
    console.log("\n-------------------------------------------------------");
    console.log("Enter target X Post URLs (separate multiple URLs with commas or newlines):");
    const urlsInput = await askQuestion("URLs: ");
    const rawUrls = urlsInput
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const validUrls: string[] = [];
    for (const url of rawUrls) {
      const parsed = validateAndParseXPostUrl(url);
      if (parsed.valid && parsed.normalizedUrl) {
        validUrls.push(parsed.normalizedUrl);
      } else {
        console.log(`⚠️ Invalid URL skipped: "${url}" -> ${parsed.error}`);
      }
    }

    if (validUrls.length === 0) {
      console.log("❌ No valid X post URLs provided. Exiting.");
      rl.close();
      return;
    }

    // 3. Input Reply Message
    let replyText = "";
    while (!replyText) {
      const input = await askQuestion("Enter Reply Message for all posts: ");
      const trimmed = input.trim();
      if (!trimmed) {
        console.log("❌ Reply message cannot be empty.");
      } else if (trimmed.length > 280) {
        console.log(`❌ Message exceeds 280 characters (${trimmed.length}/280).`);
      } else {
        replyText = trimmed;
      }
    }

    // 4. Select Confirmation Mode
    console.log("\nSelect Execution Confirmation Mode:");
    console.log("  [1] Safe Mode (Prompt before submitting each post)");
    console.log("  [2] Batch Mode (Approve entire queue now and process automatically)");
    const modeChoice = await askQuestion("Choice (1/2, default 1): ");
    const confirmationMode: ConfirmationMode = modeChoice.trim() === "2" ? "batch" : "per-post";

    // 5. Ask whether to keep browser open after completion
    const keepBrowser = await askQuestion("Keep browser open after job finishes? [y/N]: ");
    const keepBrowserOpenOnFinish = keepBrowser.trim().toLowerCase() === "y";

    // 6. Create Job in Queue
    const job = jobQueue.createJob({
      urls: validUrls,
      reply: replyText,
      confirmationMode,
    });

    console.log("\n=======================================================");
    console.log("                  READY TO PROCESS                     ");
    console.log("=======================================================");
    console.log(`Job ID: ${job.id}`);
    console.log(`Total Posts: ${job.totalItems}`);
    console.log(`Confirmation Mode: ${job.confirmationMode.toUpperCase()}`);
    console.log(`Reply Message: "${job.reply}"`);
    console.log("\nTarget Posts:");
    job.items.forEach((item, idx) => {
      console.log(`  ${idx + 1}. ${item.postUrl}`);
    });
    console.log("=======================================================\n");

    const startConfirm = await askQuestion("Start processing queue? [y/N]: ");
    if (startConfirm.trim().toLowerCase() !== "y") {
      log("Queue processing cancelled by user.", "warn");
      rl.close();
      return;
    }

    // 7. Execute Job via Processor
    const processor = new JobProcessor();

    const result = await processor.processJob(job.id, {
      keepBrowserOpenOnFinish,
      onProgress: (currentJob, currentItem) => {
        const completed = currentJob.successfulItems + currentJob.failedItems + currentJob.skippedItems;
        const percent = Math.round((completed / currentJob.totalItems) * 100);
        if (currentItem) {
          console.log(`\n📊 Progress: [${completed}/${currentJob.totalItems}] (${percent}%) | Current Item: @${currentItem.username || "user"} (${currentItem.status.toUpperCase()})`);
        }
      },
      onConfirmationRequired: async (item) => {
        console.log("\n-------------------------------------------------------");
        console.log(`🔍 SAFE MODE CONFIRMATION for Item ${item.id}`);
        console.log(`URL: ${item.postUrl}`);
        console.log(`Reply: "${item.reply}"`);
        console.log("-------------------------------------------------------");
        const choice = await askQuestion(
          "Options: [1] Submit Reply  [2] Skip Post  [3] Stop Entire Queue\nEnter choice (1/2/3): "
        );
        if (choice.trim() === "2") return "skip";
        if (choice.trim() === "3") return "stop";
        return "submit";
      },
    });

    // 8. Results Summary Screen
    console.log("\n=======================================================");
    console.log("               AUTOMATION JOB COMPLETE                 ");
    console.log("=======================================================");
    console.log(`Job Status:      ${result.status.toUpperCase()}`);
    console.log(`Successful:      ${result.successfulItems}`);
    console.log(`Failed:          ${result.failedItems}`);
    console.log(`Skipped:         ${result.skippedItems}`);
    console.log("-------------------------------------------------------");
    result.items.forEach((item) => {
      const symbol =
        item.status === "success"
          ? "✓"
          : item.status === "failed"
          ? "✕"
          : "—";
      console.log(`${symbol} @${item.username || "post"} (${item.status.toUpperCase()}): ${item.postUrl}`);
      if (item.error) {
        console.log(`    Error: ${item.error}`);
      }
    });
    console.log("=======================================================\n");
  } catch (err) {
    log(`Fatal Batch CLI error: ${(err as Error).message}`, "error");
  } finally {
    rl.close();
  }
};

runBatchCLI();
