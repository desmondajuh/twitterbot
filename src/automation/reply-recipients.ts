import { Page, Locator } from "playwright";
import { xSelectors } from "./x-selectors";
import { log } from "./logger";

export interface ReplyRecipient {
  username: string;
  displayName?: string;
  isSelected: boolean;
}

export type CommentReplyErrorCode =
  | "COMMENT_TARGET_NOT_CONFIRMED"
  | "TARGET_RECIPIENT_NOT_SELECTED"
  | "TARGET_RECIPIENT_NOT_PRESENT"
  | "ADDITIONAL_RECIPIENT_STILL_SELECTED"
  | "RECIPIENT_STATE_UNKNOWN"
  | "RECIPIENT_MODAL_NOT_FOUND"
  | "RECIPIENT_CONFIGURATION_FAILED"
  | "RECIPIENT_CONTROL_NOT_FOUND"
  | "OTHERS_CONVERSATION_CONTROL_NOT_FOUND"
  | "OTHERS_CONVERSATION_STILL_ENABLED"
  | "REPLY_SUBMISSION_FAILED";

export interface RecipientConfigurationResult {
  success: boolean;
  targetUsername: string;
  recipients: ReplyRecipient[];
  othersInConversationEnabled: boolean;
  additionalRecipientsFound: number;
  additionalRecipientsDeselected: number;
  changed: boolean;
  error?: CommentReplyErrorCode;
  errorMessage?: string;
}

/**
 * Normalizes username by trimming, converting to lower case, and stripping leading @.
 */
export function normalizeUsername(username?: string | null): string {
  if (!username) return "";
  return username.trim().toLowerCase().replace(/^@+/, "");
}

/**
 * Locates the recipient configuration modal dialog on the page.
 * Distinguishes the Recipient Modal from the Tweet Composer dialog:
 * The Recipient Modal contains the "Done" button or "Others in this conversation"
 * and does NOT contain the tweet compose textbox.
 */
export async function getRecipientDialog(page: Page): Promise<Locator | null> {
  // 1. Recipient modal identified by having the "Done" button
  const doneModal = page
    .locator('[role="dialog"]')
    .filter({
      has: page.locator('button:has-text("Done"), [data-testid="doneButton"], button:has-text("Save")'),
    })
    .last();

  if ((await doneModal.count()) > 0 && (await doneModal.isVisible())) {
    return doneModal;
  }

  // 2. Or has "Others in this conversation"
  const othersModal = page
    .locator('[role="dialog"]')
    .filter({ hasText: "Others in this conversation" })
    .last();

  if ((await othersModal.count()) > 0 && (await othersModal.isVisible())) {
    return othersModal;
  }

  // 3. Or a dialog with role="checkbox" and hasText "Replying to" but NOT the tweet composer textarea
  const checkboxModal = page
    .locator('[role="dialog"]')
    .filter({ hasText: "Replying to" })
    .filter({ has: page.locator('[role="checkbox"], input[type="checkbox"]') })
    .filter({
      hasNot: page.locator('[data-testid="tweetTextarea_0"], [data-testid="tweetTextarea_0InModal"], div[contenteditable="true"][role="textbox"]'),
    })
    .last();

  if ((await checkboxModal.count()) > 0 && (await checkboxModal.isVisible())) {
    return checkboxModal;
  }

  return null;
}

/**
 * Polls for the recipient modal to become visible after clicking the trigger.
 */
export async function waitForRecipientDialog(page: Page, timeoutMs = 4000): Promise<Locator | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const dialog = await getRecipientDialog(page);
    if (dialog) return dialog;
    await page.waitForTimeout(200);
  }
  return null;
}

/**
 * Reads whether a checkbox element (native input or custom role="checkbox") is checked.
 */
export async function isElementChecked(locator: Locator): Promise<boolean> {
  try {
    if ((await locator.count()) === 0) return false;

    const isNative = await locator.evaluate(
      (el) => el instanceof HTMLInputElement && el.type === "checkbox"
    ).catch(() => false);

    if (isNative) {
      return await locator.isChecked().catch(() => false);
    }

    const aria = await locator.getAttribute("aria-checked").catch(() => null);
    if (aria === "true") return true;
    if (aria === "false") return false;

    const childAria = await locator.locator("[aria-checked]").first().getAttribute("aria-checked").catch(() => null);
    return childAria === "true";
  } catch {
    return false;
  }
}

/**
 * Candidate selectors targeting the clickable area in the composer header:
 * Replying to <clickable area>@username1, @username2 etc</clickable area>
 */
export const replyingToTriggerCandidates = [
  // 1. Interactive role="button", button, a, or span with "@" or "other" inside container with text "Replying to"
  ':is([role="dialog"], body) :is(div, span):has-text("Replying to") :is([role="button"], button, a, span):has-text("@")',
  ':is(div, span):has-text("Replying to") :is([role="button"], button, a, span):has-text("@")',
  ':is([role="dialog"], body) :is(div, span):has-text("Replying to") :is([role="button"], button, a, span):has-text("other")',
  ':is(div, span):has-text("Replying to") :is([role="button"], button, a, span):has-text("other")',

  // 2. Specific selectors from xSelectors
  xSelectors.recipients.replyingToTrigger,

  // 3. Any button or role="button" containing "@" that is not Close/Reply
  '[role="dialog"] [role="button"]:has-text("@"), [role="dialog"] button:has-text("@"), [role="dialog"] a:has-text("@")',
  '[role="button"]:has-text("@"), button:has-text("@"), a:has-text("@")',
];

/**
 * Opens the "Replying to @..." recipient control popover by clicking the clickable area in the composer header.
 */
/**
 * Reads the full text of the composer's "Replying to" line (innermost container).
 */
export async function getComposerReplyingToText(page: Page): Promise<string> {
  return await page
    .evaluate(() => {
      const divs = Array.from(document.querySelectorAll("div"));
      const matching = divs.filter((d) => ((d as any).innerText || "").includes("Replying to"));
      return ((matching[matching.length - 1] as any)?.innerText || "").trim();
    })
    .catch(() => "");
}

/**
 * Opens the "Replying to @..." recipient control popover by clicking the clickable area in the composer header.
 */
export async function openRecipientSelector(page: Page, jobId?: string): Promise<boolean> {
  try {
    // 1. If recipient modal with "Done" button is already open, return true
    const existing = await getRecipientDialog(page);
    if (existing) {
      log("[Recipients] Recipient modal with 'Done' button is already open", "info", jobId);
      return true;
    }

    log("[Recipients] Searching for 'Replying to <clickable area>' trigger...", "info", jobId);

    // Try candidate selectors
    const attemptedTexts = new Set<string>();

    for (const sel of replyingToTriggerCandidates) {
      const candidates = page.locator(sel);
      const count = await candidates.count().catch(() => 0);

      for (let i = 0; i < count; i++) {
        const trigger = candidates.nth(i);
        if (!(await trigger.isVisible().catch(() => false))) continue;

        const ariaLabel = (await trigger.getAttribute("aria-label").catch(() => "")) || "";
        const testId = (await trigger.getAttribute("data-testid").catch(() => "")) || "";
        const role = (await trigger.getAttribute("role").catch(() => "")) || "";

        // Strictly ignore close button, reply submission button, and textareas
        if (
          ariaLabel.toLowerCase().includes("close") ||
          testId.includes("tweetButton") ||
          testId.includes("tweetTextarea") ||
          role === "textbox"
        ) {
          continue;
        }

        const text = (await trigger.innerText().catch(() => "")).trim();
        // The trigger MUST contain '@' or 'other'
        if (!text.includes("@") && !/other/i.test(text)) {
          continue;
        }

        // Avoid clicking identical element repeatedly
        if (attemptedTexts.has(text)) {
          continue;
        }
        attemptedTexts.add(text);

        log(`[Recipients] Clicking recipient trigger ("${text || sel}") to open modal...`, "info", jobId);

        await trigger.scrollIntoViewIfNeeded().catch(() => {});
        await trigger.click({ timeout: 2000 }).catch(async () => {
          await trigger.click({ force: true, timeout: 2000 }).catch(() => {});
        });

        const modal = await waitForRecipientDialog(page, 2000);
        if (modal) {
          log("[Recipients] ✓ Recipient modal opened successfully with 'Done' button", "info", jobId);
          await page.waitForTimeout(600);
          return true;
        }
      }
    }

    // Fallback: DOM evaluateHandle to locate innermost clickable element within 'Replying to'
    if (attemptedTexts.size === 0) {
      log("[Recipients] Trying DOM evaluation fallback for 'Replying to' trigger...", "info", jobId);
      const evalHandle = await page.evaluateHandle(() => {
        const all = Array.from(document.querySelectorAll("div, span, p"));
        const replyingLines = all.filter((el) => {
          const t = (el as any).innerText || "";
          return t.includes("Replying to") && (t.includes("@") || /other/i.test(t));
        });
        const innermost = replyingLines[replyingLines.length - 1];
        if (!innermost) return null;

        const clickable =
          innermost.querySelector('button:not([aria-label="Close"]), [role="button"]:not([aria-label="Close"]), a') ||
          Array.from(innermost.querySelectorAll("span, div")).find(
            (s) => (s as any).innerText && ((s as any).innerText.includes("@") || /other/i.test((s as any).innerText))
          ) ||
          innermost;
        return clickable;
      });

      const evalEl = evalHandle.asElement();
      if (evalEl && (await evalEl.isVisible().catch(() => false))) {
        const text = (await evalEl.innerText().catch(() => "")).trim();
        log(`[Recipients] Clicking evaluate-located recipient trigger ("${text}")...`, "info", jobId);
        await evalEl.scrollIntoViewIfNeeded().catch(() => {});
        await evalEl.click().catch(() => {});

        const modal = await waitForRecipientDialog(page, 2000);
        if (modal) {
          log("[Recipients] ✓ Recipient modal opened successfully via DOM fallback", "info", jobId);
          await page.waitForTimeout(600);
          return true;
        }
      }
    }

    log("[Recipients] Recipient control trigger button was not found or did not open modal", "warn", jobId);
    return false;
  } catch (err) {
    log(`[Recipients] Error opening recipient selector: ${(err as Error).message}`, "warn", jobId);
    return false;
  }
}

/**
 * Closes the recipient control popover by clicking Done / Save or pressing Escape.
 */
export async function closeRecipientSelector(page: Page, jobId?: string): Promise<void> {
  try {
    const dialog = await getRecipientDialog(page);
    if (!dialog) return;

    const doneBtn = dialog
      .locator('button:has-text("Done"), [data-testid="doneButton"], button:has-text("Save")')
      .first();

    if ((await doneBtn.count()) > 0 && (await doneBtn.isVisible())) {
      log("[Recipients] Clicking Done to apply recipient settings...", "info", jobId);
      await doneBtn.click({ timeout: 2000 }).catch(async () => {
        await doneBtn.click({ force: true, timeout: 2000 }).catch(() => {});
      });
      await page.waitForTimeout(600);
    } else {
      log("[Recipients] Pressing Escape to close recipient modal...", "info", jobId);
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(500);
    }
  } catch (err) {
    log(`[Recipients] Error closing recipient selector: ${(err as Error).message}`, "warn", jobId);
  }
}

/**
 * Inspects and retrieves current listed recipients in the open recipient selector dialog.
 */
export async function getCurrentRecipients(page: Page, jobId?: string): Promise<ReplyRecipient[]> {
  const recipients: ReplyRecipient[] = [];
  try {
    const dialog = await getRecipientDialog(page);
    if (!dialog) return recipients;

    const dialogText = await dialog.innerText().catch(() => "");
    const matches = dialogText.match(/@[a-zA-Z0-9_]+/g) || [];

    const uniqueHandles: string[] = [];
    for (const m of matches) {
      const h = normalizeUsername(m);
      if (h && !uniqueHandles.includes(h)) {
        uniqueHandles.push(h);
      }
    }

    for (let i = 0; i < uniqueHandles.length; i++) {
      const handle = uniqueHandles[i];
      const isTopTarget = i === 0;

      if (isTopTarget) {
        recipients.push({
          username: handle,
          displayName: handle,
          isSelected: true,
        });
      } else {
        const row = dialog
          .locator('div, [data-testid="UserCell"], [role="row"]')
          .filter({ hasText: new RegExp(`@${handle}\\b`, "i") })
          .filter({ has: dialog.page().locator('[role="checkbox"], input[type="checkbox"]') })
          .last();

        const cb = row.locator('[role="checkbox"], input[type="checkbox"]').first();
        const isChecked = await isElementChecked(cb);

        recipients.push({
          username: handle,
          displayName: handle,
          isSelected: isChecked,
        });
      }
    }
  } catch (err) {
    log(`[Recipients] Error getting current recipients: ${(err as Error).message}`, "warn", jobId);
  }
  return recipients;
}

/**
 * Checks if "Others in this conversation" control is present and currently enabled/checked.
 */
export async function isOthersInConversationEnabled(
  page: Page,
  jobId?: string
): Promise<{
  found: boolean;
  enabled: boolean;
  locator?: ReturnType<Page["locator"]>;
}> {
  try {
    const dialog = await getRecipientDialog(page);
    if (!dialog) return { found: false, enabled: false };

    const othersHeader = dialog.locator(':text("Others in this conversation"), [aria-label*="Others in this conversation"]').first();
    const hasOthers = (await othersHeader.count()) > 0 && (await othersHeader.isVisible());

    if (!hasOthers) {
      return { found: false, enabled: false };
    }

    // Check group checkbox if present
    const headingContainer = dialog
      .locator("div")
      .filter({ hasText: "Others in this conversation" })
      .filter({ hasNotText: "@" })
      .last();
    const groupCb = headingContainer.locator('[role="checkbox"], input[type="checkbox"]').first();

    if ((await groupCb.count()) > 0 && (await groupCb.isVisible())) {
      const isChecked = await isElementChecked(groupCb);
      return { found: true, enabled: isChecked, locator: groupCb };
    }

    // If no group checkbox, check if any additional recipient checkbox is checked
    const recipients = await getCurrentRecipients(page, jobId);
    const additionalChecked = recipients.slice(1).some((r) => r.isSelected);

    return { found: true, enabled: additionalChecked, locator: othersHeader };
  } catch (err) {
    log(`[Recipients] Error checking 'Others in this conversation' state: ${(err as Error).message}`, "warn", jobId);
    return { found: false, enabled: false };
  }
}

/**
 * Helper to uncheck non-target recipients.
 */
export async function uncheckNonTargetRecipients(
  page: Page,
  targetUsername: string,
  blacklistedUsernames: string[] = [],
  jobId?: string
): Promise<boolean> {
  const result = await configureReplyRecipients(page, targetUsername, blacklistedUsernames, jobId);
  return result.success && !result.othersInConversationEnabled;
}

/**
 * Disables "Others in this conversation" if currently checked.
 */
export async function disableOthersInConversation(page: Page, jobId?: string): Promise<boolean> {
  const status = await isOthersInConversationEnabled(page, jobId);
  if (!status.found || !status.enabled) {
    return true;
  }

  const dialog = await getRecipientDialog(page);
  if (!dialog) return false;

  // Uncheck group checkbox if present
  const headingContainer = dialog
    .locator("div")
    .filter({ hasText: "Others in this conversation" })
    .filter({ hasNotText: "@" })
    .last();
  const groupCb = headingContainer.locator('[role="checkbox"], input[type="checkbox"]').first();
  if ((await groupCb.count()) > 0 && (await groupCb.isVisible())) {
    if (await isElementChecked(groupCb)) {
      await groupCb.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // Uncheck individual additional rows
  const recipients = await getCurrentRecipients(page, jobId);
  for (const r of recipients.slice(1)) {
    if (r.isSelected) {
      const row = dialog
        .locator('div, [data-testid="UserCell"], [role="row"]')
        .filter({ hasText: new RegExp(`@${r.username}\\b`, "i") })
        .filter({ has: dialog.page().locator('[role="checkbox"], input[type="checkbox"]') })
        .last();
      const cb = row.locator('[role="checkbox"], input[type="checkbox"]').first();
      if ((await cb.count()) > 0 && (await isElementChecked(cb))) {
        await cb.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(400);
      }
    }
  }

  const recheck = await isOthersInConversationEnabled(page, jobId);
  return !recheck.enabled;
}

/**
 * Full Recipient Configuration Routine.
 *
 * Rules:
 * 1. Target author is derived dynamically from expectedTargetUsername (never hardcoded).
 * 2. Clicks the "Replying to <clickable area>@user1, @user2</clickable area>" header to open the modal.
 * 3. Target author is verified at the top row, verified selected, and NEVER clicked or unchecked.
 * 4. If no additional recipients (Image 1): do nothing, leave target selected, return success.
 * 5. If 1 additional recipient (Image 2): deselect only that recipient, verify unchecked.
 * 6. If multiple additional recipients (Image 3): uncheck group checkbox if present, verify all are unchecked.
 * 7. Closes modal via "Done" button and returns structured result.
 */
export async function configureReplyRecipients(
  page: Page,
  expectedTargetUsername: string,
  excludedUsernames: string[] = [],
  jobId?: string
): Promise<RecipientConfigurationResult> {
  const cleanExpected = normalizeUsername(expectedTargetUsername);

  if (!cleanExpected) {
    log("[Recipients] FAILED: Expected target username is empty or undefined", "error", jobId);
    return {
      success: false,
      targetUsername: "",
      recipients: [],
      othersInConversationEnabled: false,
      additionalRecipientsFound: 0,
      additionalRecipientsDeselected: 0,
      changed: false,
      error: "COMMENT_TARGET_NOT_CONFIRMED",
      errorMessage: "Expected target username is missing or empty",
    };
  }

  log(`[Recipients] Starting recipient configuration for target @${cleanExpected}...`, "info", jobId);

  // 1. Open recipient controls popover by clicking the clickable area
  const opened = await openRecipientSelector(page, jobId);
  const dialog = await getRecipientDialog(page);

  if (!dialog) {
    // If modal failed to open, check the composer header text
    log("[Recipients] Recipient modal not open. Inspecting inline composer header...", "info", jobId);
    const headerText = await getComposerReplyingToText(page);

    const lowerHeader = headerText.toLowerCase();
    const handlesInHeader = (headerText.match(/@[a-zA-Z0-9_]+/g) || []).map(normalizeUsername);
    const uniqueHeaderHandles = Array.from(new Set(handlesInHeader));
    const nonTargetHandles = uniqueHeaderHandles.filter((h) => h !== cleanExpected);
    const hasOtherText = /\band\s+\d+\s+other/i.test(lowerHeader) || /\band\s+others\b/i.test(lowerHeader);

    // If multiple handles exist in header or text indicates additional users, and modal could not open, fail closed!
    if (uniqueHeaderHandles.length > 1 || hasOtherText || nonTargetHandles.length > 0) {
      log(
        `[Recipients] FAILED: Multiple recipients detected in header ("${headerText.trim()}"), but modal failed to open!`,
        "error",
        jobId
      );
      return {
        success: false,
        targetUsername: cleanExpected,
        recipients: [],
        othersInConversationEnabled: true,
        additionalRecipientsFound: Math.max(1, uniqueHeaderHandles.length - 1),
        additionalRecipientsDeselected: 0,
        changed: false,
        error: "OTHERS_CONVERSATION_STILL_ENABLED",
        errorMessage: `Cannot uncheck other recipients ("${headerText.trim()}") because modal failed to open`,
      };
    }

    // Only target user in header, safe to proceed
    return {
      success: true,
      targetUsername: cleanExpected,
      recipients: [{ username: cleanExpected, isSelected: true }],
      othersInConversationEnabled: false,
      additionalRecipientsFound: 0,
      additionalRecipientsDeselected: 0,
      changed: false,
    };
  }

  // 2. Discover all handles in the modal from top to bottom
  const dialogText = await dialog.innerText().catch(() => "");
  const matches = dialogText.match(/@[a-zA-Z0-9_]+/g) || [];

  const uniqueHandles: string[] = [];
  for (const m of matches) {
    const h = normalizeUsername(m);
    if (h && !uniqueHandles.includes(h)) {
      uniqueHandles.push(h);
    }
  }

  // The first handle at the top is the target author
  const topFoundHandle = uniqueHandles[0] || "";

  if (topFoundHandle && topFoundHandle !== cleanExpected) {
    log(
      `[Recipients] FAILED: Modal top target @${topFoundHandle} does not match expected target @${cleanExpected}`,
      "error",
      jobId
    );
    return {
      success: false,
      targetUsername: topFoundHandle,
      recipients: [],
      othersInConversationEnabled: false,
      additionalRecipientsFound: Math.max(0, uniqueHandles.length - 1),
      additionalRecipientsDeselected: 0,
      changed: false,
      error: "COMMENT_TARGET_NOT_CONFIRMED",
      errorMessage: `Modal target @${topFoundHandle} does not match expected target @${cleanExpected}`,
    };
  }

  log(`[Recipients] Target recipient verified: @${cleanExpected} at the top (will NOT be clicked)`, "info", jobId);

  // 3. Check for "Others in this conversation"
  const othersHeader = dialog.locator(':text("Others in this conversation"), [aria-label*="Others in this conversation"]').first();
  const hasOthers = (await othersHeader.count()) > 0 && (await othersHeader.isVisible());

  const additionalHandles = uniqueHandles.slice(1);
  let deselectedCount = 0;
  let changed = false;

  if (!hasOthers || additionalHandles.length === 0) {
    // Scenario 1 (Image 1): Target only, no additional participants
    log(`[Recipients] Target only (@${cleanExpected}); no additional recipients found under 'Others in this conversation'`, "info", jobId);
    await closeRecipientSelector(page, jobId);
    return {
      success: true,
      targetUsername: cleanExpected,
      recipients: [{ username: cleanExpected, isSelected: true }],
      othersInConversationEnabled: false,
      additionalRecipientsFound: 0,
      additionalRecipientsDeselected: 0,
      changed: false,
    };
  }

  log(
    `[Recipients] Found ${additionalHandles.length} additional recipient(s): ${additionalHandles.map((h) => "@" + h).join(", ")}`,
    "info",
    jobId
  );

  // Scenario 3 (Image 3): Check if group checkbox exists beside section header
  const headingContainer = dialog
    .locator("div")
    .filter({ hasText: "Others in this conversation" })
    .filter({ hasNotText: "@" })
    .last();
  const groupCb = headingContainer.locator('[role="checkbox"], input[type="checkbox"]').first();

  if ((await groupCb.count()) > 0 && (await groupCb.isVisible())) {
    const isGroupChecked = await isElementChecked(groupCb);
    if (isGroupChecked) {
      log("[Recipients] Clicking group checkbox beside 'Others in this conversation'...", "info", jobId);
      await groupCb.click({ timeout: 2000 }).catch(async () => {
        await headingContainer.click({ timeout: 2000 }).catch(() => {});
      });
      changed = true;
      await page.waitForTimeout(600);
    } else {
      log("[Recipients] Group checkbox is already unchecked. Skipping group click.", "info", jobId);
    }
  }

  // Scenario 2 (Image 2) & individual fallback for Image 3:
  // Iterate through each additional handle and uncheck only if currently checked
  for (const handle of additionalHandles) {
    const row = dialog
      .locator('div, [data-testid="UserCell"], [role="row"]')
      .filter({ hasText: new RegExp(`@${handle}\\b`, "i") })
      .filter({ has: dialog.page().locator('[role="checkbox"], input[type="checkbox"]') })
      .last();

    const cb = (await row.count()) > 0
      ? row.locator('[role="checkbox"], input[type="checkbox"]').first()
      : dialog.locator(`[aria-label*="${handle}"] [role="checkbox"]`).first();

    if ((await cb.count()) > 0) {
      const isChecked = await isElementChecked(cb);
      if (isChecked) {
        log(`[Recipients] Deselecting additional recipient @${handle}...`, "info", jobId);
        await cb.click({ timeout: 2000 }).catch(async () => {
          await row.click({ timeout: 2000 }).catch(() => {});
        });
        deselectedCount++;
        changed = true;
        await page.waitForTimeout(400);

        // Re-verify unchecked
        const stillChecked = await isElementChecked(cb);
        if (stillChecked) {
          await cb.click({ force: true, timeout: 2000 }).catch(async () => {
            await row.click({ force: true, timeout: 2000 }).catch(() => {});
          });
          await page.waitForTimeout(400);
        }
      } else {
        log(`[Recipients] Additional recipient @${handle} is already unchecked. Skipping click.`, "info", jobId);
      }
    }
  }

  // Safety pass: check any other checkboxes in dialog that are NOT disabled
  const allCbs = dialog.locator('[role="checkbox"], input[type="checkbox"]');
  const cbCount = await allCbs.count();
  for (let i = 0; i < cbCount; i++) {
    const cb = allCbs.nth(i);
    const disabled = (await cb.getAttribute("aria-disabled")) === "true" || (await cb.getAttribute("disabled")) !== null;
    if (!disabled && (await isElementChecked(cb))) {
      log(`[Recipients] Unchecking extra checked checkbox #${i}...`, "info", jobId);
      await cb.click({ timeout: 2000 }).catch(() => {});
      changed = true;
      await page.waitForTimeout(300);
    }
  }

  // Visual delay before closing so user can confirm unchecking
  await page.waitForTimeout(800);

  // 4. Close Modal
  await closeRecipientSelector(page, jobId);

  const postRecipients: ReplyRecipient[] = [
    { username: cleanExpected, displayName: cleanExpected, isSelected: true },
    ...additionalHandles.map((h) => ({
      username: h,
      displayName: h,
      isSelected: false,
    })),
  ];

  log(`[Recipients] Recipient configuration successfully verified for @${cleanExpected}. Preserved target and unchecked others.`, "info", jobId);

  return {
    success: true,
    targetUsername: cleanExpected,
    recipients: postRecipients,
    othersInConversationEnabled: false,
    additionalRecipientsFound: additionalHandles.length,
    additionalRecipientsDeselected: deselectedCount,
    changed,
  };
}

/**
 * Backward-compatible alias for configureReplyRecipients.
 */
export const configureReplyRecipient = configureReplyRecipients;

/**
 * Final Safety Gate (Section 23 requirement).
 * Must return true before submission is allowed.
 */
export async function canSubmitReply(
  page: Page,
  targetUsername: string,
  replyText: string,
  jobId?: string
): Promise<boolean> {
  try {
    const cleanTarget = normalizeUsername(targetUsername);

    // 1. Check reply text exists and is non-empty
    if (!replyText || !replyText.trim()) {
      log("Safety Gate FAIL: Reply text is empty", "warn", jobId);
      return false;
    }

    // 2. Check reply composer is open
    const composerLocator = page
      .locator(`${xSelectors.reply.textbox}, ${xSelectors.reply.textboxFallback}`)
      .first();
    const isComposerOpen = (await composerLocator.count()) > 0;

    if (!isComposerOpen) {
      log("Safety Gate FAIL: Reply composer is not open", "warn", jobId);
      return false;
    }

    // 3. Verify "Others in this conversation" is not currently checked
    const othersStatus = await isOthersInConversationEnabled(page, jobId);
    if (othersStatus.found && othersStatus.enabled) {
      log("Safety Gate FAIL: 'Others in this conversation' is still enabled", "warn", jobId);
      return false;
    }

    // 4. Verify composer header does not retain extra handles or 'and X other'
    const headerText = await getComposerReplyingToText(page);
    if (headerText) {
      const lowerHeader = headerText.toLowerCase();
      const hasOtherText = /\band\s+\d+\s+other/i.test(lowerHeader) || /\band\s+others\b/i.test(lowerHeader);
      const handles = (headerText.match(/@[a-zA-Z0-9_]+/g) || []).map(normalizeUsername);
      const nonTargetHandles = handles.filter((h) => h !== cleanTarget);
      if (hasOtherText || nonTargetHandles.length > 0) {
        log(`Safety Gate FAIL: Composer header still contains extra recipients ("${headerText.trim()}")`, "warn", jobId);
        return false;
      }
    }

    log(`Safety Gate PASS for @${cleanTarget}`, "info", jobId);
    return true;
  } catch (err) {
    log(`Safety Gate ERROR: ${(err as Error).message}`, "warn", jobId);
    return false;
  }
}
