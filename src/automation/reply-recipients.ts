import { Page } from "playwright";
import { xSelectors } from "./x-selectors";
import { log } from "./logger";

export interface ReplyRecipient {
  username: string;
  displayName?: string;
  isSelected: boolean;
}

export type CommentReplyErrorCode =
  | "COMMENT_TARGET_NOT_CONFIRMED"
  | "RECIPIENT_CONTROL_NOT_FOUND"
  | "OTHERS_CONVERSATION_CONTROL_NOT_FOUND"
  | "OTHERS_CONVERSATION_STILL_ENABLED"
  | "TARGET_RECIPIENT_NOT_PRESENT"
  | "RECIPIENT_STATE_UNKNOWN"
  | "REPLY_SUBMISSION_FAILED";

export interface RecipientConfigurationResult {
  success: boolean;
  targetUsername: string;
  recipients: ReplyRecipient[];
  othersInConversationEnabled: boolean;
  error?: CommentReplyErrorCode;
  errorMessage?: string;
}

/**
 * Opens the "Replying to @..." recipient control popover in the active composer.
 */
export async function openRecipientSelector(page: Page, jobId?: string): Promise<boolean> {
  try {
    const trigger = page.locator(xSelectors.recipients.replyingToTrigger).first();
    if ((await trigger.count()) > 0 && (await trigger.isVisible())) {
      log("Opening reply recipient control popover...", "info", jobId);
      await trigger.click();
      await page.waitForSelector('[role="dialog"]', { state: "visible", timeout: 4000 }).catch(() => {});
      // Visual delay so user can confirm recipient area is open in browser window
      await page.waitForTimeout(1200);
      return true;
    }
    log("Recipient control trigger button was not found or is not visible", "info", jobId);
    return false;
  } catch (err) {
    log(`Error opening recipient selector: ${(err as Error).message}`, "warn", jobId);
    return false;
  }
}

/**
 * Inspects and retrieves current listed recipients in the open recipient selector dialog.
 */
export async function getCurrentRecipients(page: Page, jobId?: string): Promise<ReplyRecipient[]> {
  const recipients: ReplyRecipient[] = [];
  try {
    const dialog = page.locator('[role="dialog"]').last();
    if ((await dialog.count()) === 0) return recipients;

    const items = dialog.locator('[data-testid="User-Name"], [role="checkbox"], label');
    const count = await items.count();

    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).innerText().catch(() => "");
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      let username = "";
      let displayName = "";

      for (const line of lines) {
        if (line.startsWith("@")) {
          username = line.substring(1).trim();
        } else if (!displayName && !line.startsWith("@")) {
          displayName = line.trim();
        }
      }

      if (username && !recipients.some((r) => r.username.toLowerCase() === username.toLowerCase())) {
        const row = items.nth(i);
        const checkbox = row.locator('input[type="checkbox"], [role="checkbox"]').first();
        let isChecked = false;

        if ((await checkbox.count()) > 0) {
          isChecked = await checkbox.isChecked().catch(async () => {
            const ariaChecked = await checkbox.getAttribute("aria-checked");
            return ariaChecked === "true";
          });
        } else {
          const ariaChecked = await row.getAttribute("aria-checked");
          isChecked = ariaChecked === "true";
        }

        recipients.push({
          username,
          displayName: displayName || username,
          isSelected: isChecked,
        });
      }
    }
  } catch (err) {
    log(`Error getting current recipients: ${(err as Error).message}`, "warn", jobId);
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
    const dialog = page.locator('[role="dialog"]').last();
    const targetScope = (await dialog.count()) > 0 ? dialog : page;

    // Search for element containing text "Others in this conversation"
    const container = targetScope.locator(':has-text("Others in this conversation")').last();

    if ((await container.count()) > 0 && (await container.isVisible())) {
      const checkbox = container.locator('input[type="checkbox"], [role="checkbox"]').first();
      let isChecked = false;

      if ((await checkbox.count()) > 0) {
        isChecked = await checkbox.isChecked().catch(async () => {
          const ariaChecked = await checkbox.getAttribute("aria-checked");
          return ariaChecked === "true";
        });
      } else {
        const ariaChecked = await container.getAttribute("aria-checked");
        if (ariaChecked !== null) {
          isChecked = ariaChecked === "true";
        } else {
          // Check if sibling or child checkbox is aria-checked
          const childAria = await container.locator('[aria-checked="true"]').count();
          isChecked = childAria > 0;
        }
      }

      return { found: true, enabled: isChecked, locator: container };
    }
  } catch (err) {
    log(`Error checking 'Others in this conversation' state: ${(err as Error).message}`, "warn", jobId);
  }

  return { found: false, enabled: false };
}

/**
 * Unchecks any recipient or "Others in this conversation" control that is NOT targetUsername,
 * as well as mandatorily unchecking any blacklisted usernames.
 * Adds 1000ms visual delays after state changes so user can confirm unchecking in browser window.
 */
export async function uncheckNonTargetRecipients(
  page: Page,
  targetUsername: string,
  blacklistedUsernames: string[] = [],
  jobId?: string
): Promise<boolean> {
  const cleanTarget = targetUsername.toLowerCase().replace(/^@/, "");
  const cleanBlacklist = blacklistedUsernames.map((u) => u.toLowerCase().replace(/^@/, ""));

  log(
    `Inspecting recipients popover to uncheck non-target handles (target: @${cleanTarget}) and blacklisted usernames (${cleanBlacklist.map(u => '@' + u).join(", ") || "none"})...`,
    "info",
    jobId
  );

  const dialog = page.locator('[role="dialog"]').last();
  const modalScope = (await dialog.count()) > 0 ? dialog : page;

  // 1. Disable "Others in this conversation" if present and enabled
  const othersStatus = await isOthersInConversationEnabled(page, jobId);
  if (othersStatus.found && othersStatus.enabled && othersStatus.locator) {
    log("Disabling 'Others in this conversation' checkbox...", "info", jobId);
    const checkboxElem = othersStatus.locator.locator('input[type="checkbox"], [role="checkbox"]').first();
    const targetToClick = (await checkboxElem.count()) > 0 && (await checkboxElem.isVisible()) ? checkboxElem : othersStatus.locator;

    await targetToClick.click().catch(() => {});
    // Visual delay so user can confirm unchecking in browser
    await page.waitForTimeout(1000);

    // Re-check if still enabled; if so, click parent container
    const recheck = await isOthersInConversationEnabled(page, jobId);
    if (recheck.enabled) {
      log("First click on 'Others in this conversation' did not uncheck it. Retrying parent container click...", "warn", jobId);
      await othersStatus.locator.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
    log("✓ 'Others in this conversation' disabled", "info", jobId);
  }

  // 2. Uncheck individual recipient handles that are not targetUsername OR are blacklisted
  try {
    const rows = modalScope.locator('[role="checkbox"], label, [data-testid="User-Name"]');
    const rowCount = await rows.count();

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const text = (await row.innerText().catch(() => "")).toLowerCase();

      // Extract handles starting with @
      const matches = text.match(/@[a-z0-9_]+/gi);
      if (!matches) continue;

      for (const match of matches) {
        const handle = match.substring(1).toLowerCase();

        const isTarget = handle === cleanTarget;
        const isBlacklisted = cleanBlacklist.includes(handle);
        const shouldUncheck = !isTarget || isBlacklisted;

        if (shouldUncheck) {
          // Locate the checkbox corresponding to this handle
          const checkbox = row.locator('input[type="checkbox"], [role="checkbox"]').first();
          const targetBox = (await checkbox.count()) > 0 ? checkbox : row;

          let isChecked = false;
          if ((await checkbox.count()) > 0) {
            isChecked = await checkbox.isChecked().catch(async () => {
              const aria = await checkbox.getAttribute("aria-checked");
              return aria === "true";
            });
          } else {
            const aria = await row.getAttribute("aria-checked");
            isChecked = aria === "true";
          }

          if (isChecked) {
            log(`Mandatorily unchecking recipient @${handle} (${isBlacklisted ? "blacklisted" : "non-target"})...`, "info", jobId);
            await targetBox.click().catch(() => {});
            // Visual delay after unchecking
            await page.waitForTimeout(1000);

            // Re-verify
            const postCheck = (await checkbox.count()) > 0 ? await checkbox.getAttribute("aria-checked") : await row.getAttribute("aria-checked");
            if (postCheck === "true") {
              await row.click({ force: true }).catch(() => {});
              await page.waitForTimeout(1000);
            }
            log(`✓ Successfully unchecked @${handle}`, "info", jobId);
          }
        }
      }
    }
  } catch (err) {
    log(`Error unchecking individual non-target recipients: ${(err as Error).message}`, "warn", jobId);
  }

  const finalOthersStatus = await isOthersInConversationEnabled(page, jobId);
  return !finalOthersStatus.enabled;
}

/**
 * Disables "Others in this conversation" if currently checked.
 */
export async function disableOthersInConversation(page: Page, jobId?: string): Promise<boolean> {
  const status = await isOthersInConversationEnabled(page, jobId);

  if (!status.found) {
    log("Control 'Others in this conversation' not found in current UI", "info", jobId);
    return true; // Control absent, nothing to disable
  }

  if (status.enabled && status.locator) {
    log("Disabling 'Others in this conversation' checkbox...", "info", jobId);
    await status.locator.click().catch(() => {});
    await page.waitForTimeout(1000);

    const verifyStatus = await isOthersInConversationEnabled(page, jobId);
    return !verifyStatus.enabled;
  }

  log("'Others in this conversation' is already disabled/unchecked", "info", jobId);
  return true;
}

/**
 * Closes the recipient control popover by clicking Done / Save / Close.
 */
export async function closeRecipientSelector(page: Page, jobId?: string): Promise<void> {
  try {
    const dialog = page.locator('[role="dialog"]').last();
    const doneBtn = (await dialog.count()) > 0
      ? dialog.locator('button:has-text("Done"), [data-testid="doneButton"], button:has-text("Save")').first()
      : page.locator(xSelectors.recipients.doneButton).first();

    if ((await doneBtn.count()) > 0 && (await doneBtn.isVisible())) {
      log("Clicking Done to apply recipient settings...", "info", jobId);
      await doneBtn.click();
      await page.waitForTimeout(800);
    } else {
      log("Pressing Escape to close recipient selector popover...", "info", jobId);
      await page.keyboard.press("Escape").catch(() => {});
      await page.waitForTimeout(600);
    }
  } catch (err) {
    log(`Error closing recipient selector: ${(err as Error).message}`, "warn", jobId);
  }
}

/**
 * Full Recipient Configuration Routine.
 * Inspects, adjusts, and validates recipient controls so only target author is targeted.
 */
export async function configureReplyRecipient(
  page: Page,
  targetUsername: string,
  blacklistedUsernames: string[] = [],
  jobId?: string
): Promise<RecipientConfigurationResult> {
  const cleanTarget = targetUsername.toLowerCase().replace(/^@/, "");
  log(`Starting recipient configuration targeting @${cleanTarget}...`, "info", jobId);

  // 1. Open recipient controls popover if available
  const opened = await openRecipientSelector(page, jobId);

  if (opened) {
    // 2. Inspect current recipients
    const currentRecipients = await getCurrentRecipients(page, jobId);
    if (currentRecipients.length > 0) {
      log(
        `Current recipients in popover: ${currentRecipients.map((r) => `@${r.username}`).join(", ")}`,
        "info",
        jobId
      );
    }

    // 3. Uncheck all non-target recipients & mandatorily uncheck blacklisted usernames
    await uncheckNonTargetRecipients(page, targetUsername, blacklistedUsernames, jobId);

    // Visual pause before closing popover so user can inspect final state in browser window
    await page.waitForTimeout(1200);

    // 4. Verify target username is present among selected recipients
    const postDisableRecipients = await getCurrentRecipients(page, jobId);
    const hasTarget = postDisableRecipients.some(
      (r) => r.username.toLowerCase() === cleanTarget && r.isSelected
    );

    await closeRecipientSelector(page, jobId);

    if (currentRecipients.length > 0 && !hasTarget) {
      log(`FAILED: Target commenter @${cleanTarget} is not present in recipient list!`, "error", jobId);
      return {
        success: false,
        targetUsername: cleanTarget,
        recipients: postDisableRecipients,
        othersInConversationEnabled: false,
        error: "TARGET_RECIPIENT_NOT_PRESENT",
        errorMessage: `Target commenter @${cleanTarget} is not present in recipients list`,
      };
    }

    log(`Recipient configuration successfully verified for @${cleanTarget}`, "info", jobId);
    return {
      success: true,
      targetUsername: cleanTarget,
      recipients: postDisableRecipients,
      othersInConversationEnabled: false,
    };
  } else {
    // If no explicit popover button exists, verify recipient text directly on composer header
    log("Recipient popover trigger not present. Inspecting inline 'Replying to' header...", "info", jobId);
    const headerText = await page
      .locator(xSelectors.recipients.replyingToTrigger)
      .first()
      .innerText()
      .catch(() => "");

    const headerLower = headerText.toLowerCase();
    const hasTargetInHeader =
      headerLower.includes(`@${cleanTarget}`) || headerLower.includes(cleanTarget);

    if (headerText && !hasTargetInHeader) {
      log(`FAILED: Header text "${headerText}" does not include target @${cleanTarget}!`, "error", jobId);
      return {
        success: false,
        targetUsername: cleanTarget,
        recipients: [],
        othersInConversationEnabled: false,
        error: "TARGET_RECIPIENT_NOT_PRESENT",
        errorMessage: `Composer header "${headerText}" does not contain @${cleanTarget}`,
      };
    }

    return {
      success: true,
      targetUsername: cleanTarget,
      recipients: [{ username: cleanTarget, isSelected: true }],
      othersInConversationEnabled: false,
    };
  }
}

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
    const cleanTarget = targetUsername.toLowerCase().replace(/^@/, "");

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

    log(`Safety Gate PASS for @${cleanTarget}`, "info", jobId);
    return true;
  } catch (err) {
    log(`Safety Gate ERROR: ${(err as Error).message}`, "warn", jobId);
    return false;
  }
}
