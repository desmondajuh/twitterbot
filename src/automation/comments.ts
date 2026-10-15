import { Page } from "playwright";
import { XComment, CommentDiscoverySettings, CommentDiscoveryResult } from "../types";
import { XClient } from "./x-client";
import { validateAndParseXPostUrl } from "../utils/url";
import { AutomationError } from "./errors";
import { log } from "./logger";
import { xSelectors } from "./x-selectors";

const DEFAULT_SETTINGS: Required<CommentDiscoverySettings> = {
  maxComments: 300,
  maxScrolls: 120,
  scrollDelayMs: 1500,
  noNewCommentsLimit: 8,
  excludedUsernames: [],
};

/**
 * Dismiss any overlays, view modals, or dialogs that might block the page timeline.
 */
async function dismissActiveModals(page: Page): Promise<void> {
  try {
    const dismissButtons = page.locator(
      'button:has-text("Dismiss"), button:has-text("Got it"), [aria-label="Close"], button:has-text("Not now")'
    );
    if ((await dismissButtons.count()) > 0 && (await dismissButtons.first().isVisible())) {
      await dismissButtons.first().click().catch(() => {});
      await page.waitForTimeout(300);
    }
  } catch {}
}

/**
 * Extracts individual comment data from a Playwright tweet container handle.
 */
async function extractCommentDataFromArticle(
  articleLocator: ReturnType<Page["locator"]>,
  parentPostId: string
): Promise<XComment | null> {
  try {
    // 1. Extract post text
    const textLocator = articleLocator.locator(xSelectors.post.tweetText).first();
    const text = (await textLocator.count()) > 0 ? (await textLocator.innerText()).trim() : "";

    // 2. Extract author username and display name from User-Name container
    const userNameContainer = articleLocator.locator('[data-testid="User-Name"]').first();
    let authorUsername = "";
    let authorDisplayName = "";

    if ((await userNameContainer.count()) > 0) {
      // Method 1: Check dedicated profile links inside User-Name
      // X links the username handle as <a href="/handle" role="link">
      const profileLinks = await userNameContainer.locator('a[href^="/"]:not([href*="/status/"])').all();
      for (const link of profileLinks) {
        const href = await link.getAttribute("href");
        if (href) {
          const handle = href.replace(/^\//, "").split("/")[0].split("?")[0].trim();
          if (handle && !["home", "explore", "notifications", "messages", "i"].includes(handle.toLowerCase())) {
            authorUsername = handle;
            const linkText = (await link.innerText()).trim();
            if (linkText && !linkText.startsWith("@") && !authorDisplayName) {
              authorDisplayName = linkText;
            }
          }
        }
      }

      // Method 2: Extract via @handle regex match from the raw container text
      const rawUserText = await userNameContainer.innerText();
      const handleMatch = rawUserText.match(/@([A-Za-z0-9_]{1,30})/);
      if (handleMatch && handleMatch[1]) {
        authorUsername = handleMatch[1];
      }

      // Extract display name from the first non-empty line before @handle or separator
      if (!authorDisplayName) {
        const lines = rawUserText.split("\n").map((l) => l.trim()).filter(Boolean);
        for (const line of lines) {
          if (!line.startsWith("@") && !line.includes("·")) {
            authorDisplayName = line.replace(/@\w+/, "").trim();
            if (authorDisplayName) break;
          }
        }
      }
    }

    // Fallback: search profile links inside the article if not found in User-Name
    if (!authorUsername) {
      const authorLink = articleLocator.locator('a[href^="/"][role="link"]:not([href*="/status/"])').first();
      if ((await authorLink.count()) > 0) {
        const href = await authorLink.getAttribute("href");
        if (href) {
          const handle = href.replace(/^\//, "").split("/")[0].split("?")[0].trim();
          if (handle && !["home", "explore", "notifications", "messages", "i"].includes(handle.toLowerCase())) {
            authorUsername = handle;
          }
        }
      }
    }

    if (authorUsername.startsWith("@")) {
      authorUsername = authorUsername.substring(1).trim();
    }

    // 3. Extract direct status URL, ID, and timestamp
    const timeLocator = articleLocator.locator("time").first();
    let commentUrl = "";
    let commentId = "";
    let createdAt: string | undefined = undefined;

    if ((await timeLocator.count()) > 0) {
      createdAt = (await timeLocator.getAttribute("datetime")) || (await timeLocator.innerText());
      // Primary: Anchor tag wrapping or associated with the <time> element
      const statusLinkWithTime = articleLocator.locator('a[href*="/status/"]:has(time)').first();
      if ((await statusLinkWithTime.count()) > 0) {
        const href = await statusLinkWithTime.getAttribute("href");
        if (href) {
          commentUrl = href.startsWith("http") ? href : `https://x.com${href.startsWith("/") ? "" : "/"}${href}`;
          const match = href.match(/\/status\/(\d+)/);
          if (match && match[1]) {
            commentId = match[1];
          }
        }
      } else {
        // Secondary: ancestor anchor of the time element
        const parentA = timeLocator.locator("xpath=ancestor::a[contains(@href, '/status/')]").first();
        if ((await parentA.count()) > 0) {
          const href = await parentA.getAttribute("href");
          if (href) {
            commentUrl = href.startsWith("http") ? href : `https://x.com${href.startsWith("/") ? "" : "/"}${href}`;
            const match = href.match(/\/status\/(\d+)/);
            if (match && match[1]) {
              commentId = match[1];
            }
          }
        }
      }
    }

    // Secondary fallback: inspect all status links in this article
    // CRITICAL: We MUST ignore any status link that points to the parentPostId!
    if (!commentId) {
      const allStatusLinks = await articleLocator.locator('a[href*="/status/"]').all();
      for (const link of allStatusLinks) {
        const href = await link.getAttribute("href");
        if (href) {
          const match = href.match(/\/status\/(\d+)/);
          if (match && match[1] && match[1] !== parentPostId) {
            commentId = match[1];
            commentUrl = href.startsWith("http") ? href : `https://x.com${href.startsWith("/") ? "" : "/"}${href}`;
            break;
          }
        }
      }
    }

    // Fallback commentId if direct link was not found
    if (!commentId && commentUrl) {
      const match = commentUrl.match(/\/status\/([A-Za-z0-9_-]+)/);
      if (match && match[1] !== parentPostId) commentId = match[1];
    }

    // If still no commentId, build stable key based on author + text hash
    if (!commentId && authorUsername && text) {
      const textHash = text.substring(0, 20).replace(/[^A-Za-z0-9_]/g, "_");
      commentId = `cmt_${authorUsername}_${textHash}`;
    }

    // If text is empty and no author username, skip this item (e.g. ad or promoted element)
    if (!text && !authorUsername) {
      return null;
    }

    // Crucial check: Exclude the parent post itself!
    if (commentId === parentPostId || (commentUrl && commentUrl.endsWith(`/status/${parentPostId}`))) {
      return null;
    }

    const finalAuthor = authorUsername || "anonymous";
    const finalId = commentId || `unknown_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const finalUrl = commentUrl || `https://x.com/${finalAuthor}/status/${finalId}`;

    return {
      id: finalId,
      url: finalUrl,
      authorUsername: finalAuthor,
      authorDisplayName: authorDisplayName || finalAuthor || "Anonymous User",
      text,
      createdAt,
      parentPostId,
      isSelected: false,
    };
  } catch (err) {
    log(`Error parsing comment element: ${(err as Error).message}`, "warn");
    return null;
  }
}

/**
 * Controlled discovery loop to extract replies/comments under a target X post.
 */
export async function discoverComments(
  page: Page,
  postUrl: string,
  settings: CommentDiscoverySettings = {}
): Promise<CommentDiscoveryResult> {
  const config = { ...DEFAULT_SETTINGS, ...settings };
  const parsed = validateAndParseXPostUrl(postUrl);

  if (!parsed.valid || !parsed.postId) {
    throw new AutomationError(
      "NAVIGATION_FAILED",
      `Invalid post URL for comment discovery: ${postUrl}`
    );
  }

  const parentPostId = parsed.postId;
  const targetUrl = parsed.normalizedUrl || postUrl;

  log(`Starting comment discovery for post: ${targetUrl} (parentPostId: ${parentPostId})`, "info");

  const client = new XClient();
  await client.assertAuthenticated(page);
  await client.navigateToPost(page, targetUrl);

  const commentsById = new Map<string, XComment>();
  let noNewCommentsCount = 0;
  let scrollCount = 0;

  const tweetSelector = '[data-testid="tweet"], [role="article"]';

  // 1. Dismiss any blocking modals/popups right after navigation
  await dismissActiveModals(page);

  // 2. Initial scroll down slightly past the main post to trigger conversation loading
  await page.evaluate(() => window.scrollBy(0, 500)).catch(() => {});
  await page.waitForTimeout(1500);
  await dismissActiveModals(page);

  // 3. Wait for comments/conversation items to appear
  try {
    await page.waitForFunction(
      (sel) => {
        const els = document.querySelectorAll(sel);
        return els.length >= 2 || document.querySelectorAll('[data-testid="cellInnerDiv"]').length >= 3;
      },
      tweetSelector,
      { timeout: 7000 }
    );
  } catch {
    log("Initial wait for comment elements timed out. Proceeding to progressive scroll discovery...", "info");
  }

  while (
    commentsById.size < config.maxComments &&
    scrollCount < config.maxScrolls &&
    noNewCommentsCount < config.noNewCommentsLimit
  ) {
    const prevSize = commentsById.size;

    await dismissActiveModals(page);

    // Expand "Show more replies" if visible in DOM
    const showMoreBtn = page.locator(
      'button:has-text("Show more replies"), button:has-text("Show replies"), div[role="button"]:has-text("Show replies")'
    ).first();
    if ((await showMoreBtn.count()) > 0 && (await showMoreBtn.isVisible())) {
      log("Expanding additional replies thread...", "info");
      await showMoreBtn.click().catch(() => {});
      await page.waitForTimeout(1000);
    }

    // Locate all tweet containers currently rendered in DOM (div or article)
    const articles = page.locator(tweetSelector);
    const articleCount = await articles.count();

    for (let i = 0; i < articleCount; i++) {
      if (commentsById.size >= config.maxComments) break;

      const article = articles.nth(i);
      const comment = await extractCommentDataFromArticle(article, parentPostId);

      if (comment && comment.id && !commentsById.has(comment.id)) {
        const authorLower = comment.authorUsername.toLowerCase();
        const excludedList = (config.excludedUsernames || []).map((u) => u.toLowerCase().replace(/^@/, ""));
        const isExcluded = excludedList.includes(authorLower);

        // Double-check parent post exclusion and excluded usernames
        if (!isExcluded && comment.id !== parentPostId && !comment.url.endsWith(`/status/${parentPostId}`)) {
          commentsById.set(comment.id, comment);
        }
      }
    }

    const newSize = commentsById.size;
    log(
      `Discovery pass ${scrollCount + 1}/${config.maxScrolls}: Found ${
        newSize - prevSize
      } new comments (Total: ${newSize}/${config.maxComments})`,
      "info"
    );

    if (newSize === prevSize) {
      noNewCommentsCount++;
    } else {
      noNewCommentsCount = 0;
    }

    if (commentsById.size >= config.maxComments) {
      log(`Reached maximum discovery target of ${config.maxComments} comments. Stopping.`, "info");
      break;
    }

    // Progressive controlled scroll to trigger lazy loading of additional comments
    scrollCount++;
    await page.evaluate(() => window.scrollBy(0, 800)).catch(() => {});
    await page.keyboard.press("PageDown").catch(() => {});
    await page.waitForTimeout(config.scrollDelayMs + Math.floor(Math.random() * 500));
  }

  const comments = Array.from(commentsById.values());
  log(`Comment discovery completed for post ${parentPostId}. Discovered ${comments.length} comments.`, "info");

  return {
    postId: parentPostId,
    postUrl: targetUrl,
    comments,
    totalDiscovered: comments.length,
  };
}
