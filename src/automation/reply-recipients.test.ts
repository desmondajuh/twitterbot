import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, Browser, Page } from "playwright";
import {
  configureReplyRecipients,
  normalizeUsername,
  ReplyRecipient,
  RecipientConfigurationResult,
  getCurrentRecipients,
  canSubmitReply,
} from "./reply-recipients";

function createModalHtml(options: {
  target?: { name: string; handle: string };
  hasOthersSection?: boolean;
  groupCheckbox?: { checked?: boolean };
  others?: Array<{ name: string; handle: string; checked?: boolean }>;
}): string {
  const target = options.target || {
    name: "Comment Author",
    handle: "comment_author",
  };
  const hasOthers = options.hasOthersSection ?? false;
  const groupCb = options.groupCheckbox;
  const others = options.others || [];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Replying To Modal Test Fixture</title>
  <style>
    body { font-family: sans-serif; background: #000; color: #fff; margin: 0; padding: 20px; }
    .dialog { background: #16181c; border-radius: 16px; width: 400px; padding: 16px; border: 1px solid #333; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .header h2 { margin: 0; font-size: 18px; }
    .done-btn { background: #1d9bf0; color: #fff; border: none; border-radius: 9999px; padding: 6px 16px; cursor: pointer; font-weight: bold; }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #222; }
    .user-info { display: flex; flex-direction: column; }
    .display-name { font-weight: bold; font-size: 15px; }
    .handle { color: #71767b; font-size: 14px; }
    .checkbox { width: 20px; height: 20px; border-radius: 4px; border: 2px solid #71767b; display: flex; align-items: center; justify-content: center; cursor: pointer; user-select: none; }
    .checkbox[aria-checked="true"] { background: #1d9bf0; border-color: #1d9bf0; }
    .checkbox[aria-disabled="true"] { background: #536471 !important; border-color: #536471 !important; cursor: not-allowed; }
    .others-header { display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin: 16px 0 8px 0; font-size: 16px; }
  </style>
</head>
<body>
  <div role="dialog" aria-modal="true">
    <div class="header">
      <span>✕</span>
      <h2>Replying to</h2>
      <button class="done-btn" data-testid="doneButton">Done</button>
    </div>

    <!-- Target User Row (Always top row, disabled/locked) -->
    <div class="row target-row" data-testid="UserCell">
      <div class="user-info">
        <span class="display-name">${target.name}</span>
        <span class="handle"><span>@</span><span>${target.handle}</span></span>
      </div>
      <div role="checkbox" class="checkbox" tabindex="0" aria-checked="true" aria-disabled="true"></div>
    </div>

    ${
      hasOthers
        ? `
    <!-- Others in this conversation Section -->
    <div class="others-section">
      <div class="others-header">
        <span>Others in this conversation</span>
        ${
          groupCb
            ? `
        <div role="checkbox" id="group-cb" class="checkbox group-checkbox" tabindex="0" aria-checked="${
          groupCb.checked !== false ? "true" : "false"
        }"></div>
        `
            : ""
        }
      </div>

      <div class="others-list">
        ${others
          .map(
            (o, i) => `
        <div class="row other-user-row" data-testid="UserCell" id="other-row-${i}">
          <div class="user-info">
            <span class="display-name">${o.name}</span>
            <span class="handle"><span>@</span><span>${o.handle}</span></span>
          </div>
          <div role="checkbox" class="checkbox other-checkbox" tabindex="0" aria-checked="${
            o.checked !== false ? "true" : "false"
          }"></div>
        </div>
        `
          )
          .join("")}
      </div>
    </div>
    `
        : ""
    }
  </div>

  <script>
    document.querySelectorAll('.checkbox').forEach(cb => {
      cb.addEventListener('click', () => {
        if (cb.getAttribute('aria-disabled') === 'true') return;
        const current = cb.getAttribute('aria-checked') === 'true';
        const next = (!current).toString();
        cb.setAttribute('aria-checked', next);

        if (cb.id === 'group-cb') {
          document.querySelectorAll('.other-checkbox').forEach(otherCb => {
            otherCb.setAttribute('aria-checked', next);
          });
        }
      });
    });

    document.querySelector('.done-btn').addEventListener('click', () => {
      const dialog = document.querySelector('[role="dialog"]');
      if (dialog) dialog.style.display = 'none';
    });
  </script>
</body>
</html>
  `;
}

describe("Reply Recipients Configuration & Normalization", () => {
  it("should normalize usernames reliably", () => {
    expect(normalizeUsername("@sample_user")).toBe("sample_user");
    expect(normalizeUsername("@@Sample_User ")).toBe("sample_user");
    expect(normalizeUsername("  @User_123  ")).toBe("user_123");
    expect(normalizeUsername("alice")).toBe("alice");
    expect(normalizeUsername(null)).toBe("");
    expect(normalizeUsername(undefined)).toBe("");
  });

  it("should validate target recipient structure", () => {
    const recipients: ReplyRecipient[] = [
      { username: "john_doe", displayName: "John Doe", isSelected: true },
      { username: "mary_smith", displayName: "Mary Smith", isSelected: false },
    ];

    const result: RecipientConfigurationResult = {
      success: true,
      targetUsername: "john_doe",
      recipients,
      othersInConversationEnabled: false,
      additionalRecipientsFound: 1,
      additionalRecipientsDeselected: 1,
      changed: true,
    };

    expect(result.success).toBe(true);
    expect(result.targetUsername).toBe("john_doe");
    expect(result.recipients.length).toBe(2);
    expect(result.recipients[0].isSelected).toBe(true);
    expect(result.recipients[1].isSelected).toBe(false);
  });
});

describe("Browser Automation Scenarios (Vitest + Playwright)", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it("Scenario 1 (Image 1): Target only — leaves target selected, 0 clicks, changed=false", async () => {
    page = await browser.newPage();
    const html = createModalHtml({
      target: { name: "Author Name", handle: "author_target" },
      hasOthersSection: false,
    });
    await page.setContent(html);

    const result = await configureReplyRecipients(page, "author_target");

    expect(result.success).toBe(true);
    expect(result.targetUsername).toBe("author_target");
    expect(result.additionalRecipientsFound).toBe(0);
    expect(result.changed).toBe(false);
    expect(result.recipients).toEqual([
      { username: "author_target", isSelected: true },
    ]);
    await page.close();
  });

  it("Scenario 2 (Image 2): Target + 1 additional participant — deselects only additional recipient", async () => {
    page = await browser.newPage();
    const html = createModalHtml({
      target: { name: "Author Name", handle: "author_target" },
      hasOthersSection: true,
      others: [{ name: "Other User", handle: "other_user", checked: true }],
    });
    await page.setContent(html);

    const result = await configureReplyRecipients(page, "@author_target");

    expect(result.success).toBe(true);
    expect(result.targetUsername).toBe("author_target");
    expect(result.additionalRecipientsFound).toBe(1);
    expect(result.additionalRecipientsDeselected).toBe(1);
    expect(result.changed).toBe(true);
    expect(result.recipients.find((r) => r.username === "author_target")?.isSelected).toBe(true);
    expect(result.recipients.find((r) => r.username === "other_user")?.isSelected).toBe(false);
    await page.close();
  });

  it("Scenario 3 (Image 3): Target + multiple additional participants with group checkbox — unchecks all others", async () => {
    page = await browser.newPage();
    const html = createModalHtml({
      target: { name: "Primary Author", handle: "primary_author" },
      hasOthersSection: true,
      groupCheckbox: { checked: true },
      others: [
        { name: "Participant A", handle: "participant_a", checked: true },
        { name: "Participant B", handle: "participant_b", checked: true },
      ],
    });
    await page.setContent(html);

    const result = await configureReplyRecipients(page, "primary_author");

    expect(result.success).toBe(true);
    expect(result.targetUsername).toBe("primary_author");
    expect(result.additionalRecipientsFound).toBe(2);
    expect(result.changed).toBe(true);
    expect(result.recipients.find((r) => r.username === "primary_author")?.isSelected).toBe(true);
    expect(result.recipients.find((r) => r.username === "participant_a")?.isSelected).toBe(false);
    expect(result.recipients.find((r) => r.username === "participant_b")?.isSelected).toBe(false);
    await page.close();
  });

  it("Target mismatch: fails safely if top recipient is not the expected target", async () => {
    page = await browser.newPage();
    const html = createModalHtml({
      target: { name: "Author Name", handle: "real_author" },
      hasOthersSection: false,
    });
    await page.setContent(html);

    const result = await configureReplyRecipients(page, "unexpected_user");

    expect(result.success).toBe(false);
    expect(result.error).toBe("COMMENT_TARGET_NOT_CONFIRMED");
    await page.close();
  });

  it("Clicking Replying to <clickable area> opens recipient modal and unchecks other recipient", async () => {
    page = await browser.newPage();
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body>
  <!-- Active Composer Dialog -->
  <div role="dialog" class="composer-dialog">
    <div class="replying-to-header">
      <span>Replying to </span>
      <button type="button" id="recipient-trigger" class="clickable-usernames">@author_target and @other_user</button>
    </div>
    <div data-testid="tweetTextarea_0" contenteditable="true" role="textbox"></div>
  </div>

  <!-- Recipient Modal (Initially Hidden) -->
  <div role="dialog" id="recipient-modal" style="display: none;">
    <div>
      <h2>Replying to</h2>
      <button class="done-btn" data-testid="doneButton">Done</button>
    </div>

    <!-- Target user row -->
    <div class="row" data-testid="UserCell">
      <span>Author Target</span>
      <span>@author_target</span>
      <div role="checkbox" aria-checked="true" aria-disabled="true"></div>
    </div>

    <!-- Others section -->
    <div>
      <span>Others in this conversation</span>
      <div class="row" data-testid="UserCell">
        <span>Other User</span>
        <span>@other_user</span>
        <div id="other-cb" role="checkbox" aria-checked="true"></div>
      </div>
    </div>
  </div>

  <script>
    // Clicking trigger opens recipient modal
    document.getElementById('recipient-trigger').addEventListener('click', () => {
      document.getElementById('recipient-modal').style.display = 'block';
    });

    // Clicking other-cb toggles it
    document.getElementById('other-cb').addEventListener('click', () => {
      const cb = document.getElementById('other-cb');
      const isChecked = cb.getAttribute('aria-checked') === 'true';
      cb.setAttribute('aria-checked', (!isChecked).toString());
    });

    // Clicking done hides recipient modal
    document.querySelector('.done-btn').addEventListener('click', () => {
      document.getElementById('recipient-modal').style.display = 'none';
    });
  </script>
</body>
</html>
    `;
    await page.setContent(html);

    // Call configureReplyRecipients when only the composer is open
    const result = await configureReplyRecipients(page, "author_target");

    expect(result.success).toBe(true);
    expect(result.targetUsername).toBe("author_target");
    expect(result.additionalRecipientsFound).toBe(1);
    expect(result.additionalRecipientsDeselected).toBe(1);
    expect(result.changed).toBe(true);
    expect(result.recipients.find((r) => r.username === "author_target")?.isSelected).toBe(true);
    expect(result.recipients.find((r) => r.username === "other_user")?.isSelected).toBe(false);

    await page.close();
  }, 15000);

  it("Trigger with role=button and Close button ignores Close and opens modal", async () => {
    page = await browser.newPage();
    const html = `
<!DOCTYPE html>
<html>
<body>
  <div role="dialog" class="composer-dialog">
    <div class="header">
      <button aria-label="Close" id="close-btn">X</button>
      <button>Drafts</button>
    </div>
    <div class="reply-line">
      <span>Replying to </span>
      <div role="button" id="role-trigger" tabindex="0">@target_user and @other_user</div>
    </div>
    <div data-testid="tweetTextarea_0" contenteditable="true" role="textbox"></div>
  </div>

  <div role="dialog" id="rec-modal" style="display: none;">
    <button class="done-btn" data-testid="doneButton">Done</button>
    <div data-testid="UserCell">
      <span>Target User</span><span>@target_user</span>
      <div role="checkbox" aria-checked="true" aria-disabled="true"></div>
    </div>
    <div>Others in this conversation</div>
    <div data-testid="UserCell">
      <span>Other User</span><span>@other_user</span>
      <div id="other-check" role="checkbox" aria-checked="true"></div>
    </div>
  </div>

  <script>
    let closeClicked = false;
    document.getElementById('close-btn').addEventListener('click', () => {
      closeClicked = true;
    });
    document.getElementById('role-trigger').addEventListener('click', () => {
      document.getElementById('rec-modal').style.display = 'block';
    });
    document.getElementById('other-check').addEventListener('click', () => {
      document.getElementById('other-check').setAttribute('aria-checked', 'false');
    });
    document.querySelector('.done-btn').addEventListener('click', () => {
      document.getElementById('rec-modal').style.display = 'none';
    });
  </script>
</body>
</html>
    `;
    await page.setContent(html);

    const result = await configureReplyRecipients(page, "target_user");
    expect(result.success).toBe(true);
    expect(result.additionalRecipientsDeselected).toBe(1);

    // Verify close button was NEVER clicked
    const wasCloseClicked = await page.evaluate(() => (window as any).closeClicked);
    expect(wasCloseClicked).toBeFalsy();

    await page.close();
  }, 15000);

  it("Fails closed when composer header contains 'and 1 other' but modal cannot open", async () => {
    page = await browser.newPage();
    const html = `
<!DOCTYPE html>
<html>
<body>
  <div role="dialog">
    <div class="reply-line">
      <span>Replying to </span>
      <span>@author_target and 1 other</span>
    </div>
    <div data-testid="tweetTextarea_0" contenteditable="true" role="textbox"></div>
  </div>
</body>
</html>
    `;
    await page.setContent(html);

    const result = await configureReplyRecipients(page, "author_target");
    expect(result.success).toBe(false);
    expect(result.error).toBe("OTHERS_CONVERSATION_STILL_ENABLED");
    expect(result.othersInConversationEnabled).toBe(true);

    await page.close();
  }, 15000);

  it("Safety Gate (canSubmitReply) blocks submission if composer header still contains extra participants", async () => {
    page = await browser.newPage();
    const htmlWithExtra = `
<!DOCTYPE html>
<html>
<body>
  <div role="dialog">
    <div class="reply-line">
      <span>Replying to </span>
      <span>@author_target and 1 other</span>
    </div>
    <div data-testid="tweetTextarea_0" contenteditable="true" role="textbox"></div>
  </div>
</body>
</html>
    `;
    await page.setContent(htmlWithExtra);
    const canSubmitFail = await canSubmitReply(page, "author_target", "Hello world");
    expect(canSubmitFail).toBe(false);

    // Now update header to only target user
    const htmlSingle = `
<!DOCTYPE html>
<html>
<body>
  <div role="dialog">
    <div class="reply-line">
      <span>Replying to </span>
      <span>@author_target</span>
    </div>
    <div data-testid="tweetTextarea_0" contenteditable="true" role="textbox"></div>
  </div>
</body>
</html>
    `;
    await page.setContent(htmlSingle);
    const canSubmitPass = await canSubmitReply(page, "author_target", "Hello world");
    expect(canSubmitPass).toBe(true);

    await page.close();
  }, 15000);
});
