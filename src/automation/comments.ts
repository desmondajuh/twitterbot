import { Page } from "playwright";
import { XComment, CommentDiscoverySettings, CommentDiscoveryResult } from "../types";
import { XClient } from "./x-client";
import { validateAndParseXPostUrl } from "../utils/url";
import { AutomationError } from "./errors";
import { log } from "./logger";
import { xSelectors } from "./x-selectors";

const DEFAULT_SETTINGS: Required<CommentDiscoverySettings> = {
  maxComments: 50,
  maxScrolls: 15,
  scrollDelayMs: 1500,
  noNewCommentsLimit: 3,
  excludedUsernames: [],
};

/**
  Extracts individual comment data from a Playwright tweet article handle.
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
      const rawUserText = await userNameContainer.innerText();
      // X formats User-Name as: DisplayName\n@username\n·\ntime
      const lines = rawUserText.split("\n").map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("@")) {
          authorUsername = line.substring(1).trim();
        } else if (!authorDisplayName && !line.includes("·") && !line.startsWith("@")) {
          authorDisplayName = line.trim();
        }
      }
    }

    if (!authorUsername) {
      // Fallback: try finding link containing /status/
      const statusLink = articleLocator.locator('a[href*="/status/"]').first();
      if ((await statusLink.count()) > 0) {
        const href = await statusLink.getAttribute("href");
        if (href) {
          const match = href.match(/(?:x\.com|twitter\.com)?\/([A-Za-z0-9_]+)\/status\//i);
          if (match && match[1]) {
            authorUsername = match[1];
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
      const statusLink = timeLocator.locator("xpath=ancestor::a[contains(@href, '/status/')]").first();
      if ((await statusLink.count()) > 0) {
        const href = await statusLink.getAttribute("href");
        if (href) {
          commentUrl = href.startsWith("http")
            ? href
            : `https://x.com${href.startsWith("/") ? "" : "/"}${href}`;
          const match = href.match(/\/status\/(\d+)/);
          if (match && match[1]) {
            commentId = match[1];
          }
        }
      }
    }

    // Secondary fallback for direct status link search within the article
    if (!commentId) {
      const directLink = articleLocator.locator('a[href*="/status/"]').first();
      if ((await directLink.count()) > 0) {
        const href = await directLink.getAttribute("href");
        if (href) {
          commentUrl = href.startsWith("http")
            ? href
            : `https://x.com${href.startsWith("/") ? "" : "/"}${href}`;
          const match = href.match(/\/status\/(\d+)/);
          if (match && match[1]) {
            commentId = match[1];
          }
        }
      }
    }

    // Fallback commentId if direct link was not found
    if (!commentId && commentUrl) {
      const match = commentUrl.match(/\/status\/([A-Za-z0-9_-]+)/);
      if (match) commentId = match[1];
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
    if (commentId === parentPostId) {
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

  // Initial wait for comments section to load
  await page.waitForTimeout(1000);

  while (
    commentsById.size < config.maxComments &&
    scrollCount < config.maxScrolls &&
    noNewCommentsCount < config.noNewCommentsLimit
  ) {
    const prevSize = commentsById.size;

    // Locate all tweet articles currently rendered in the DOM
    const articles = page.locator('article[data-testid="tweet"], article[role="article"]');
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
    await page.evaluate(() => window.scrollBy(0, 700));
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
