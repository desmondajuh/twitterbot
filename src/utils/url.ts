import { z } from "zod";

export interface ParsedXPostUrl {
  valid: boolean;
  postId?: string;
  username?: string;
  normalizedUrl?: string;
  error?: string;
}

const X_URL_REGEX = /^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/@?([A-Za-z0-9_]{1,30})\/status\/([A-Za-z0-9_-]+)/i;

/**
 * Validates and parses an X (Twitter) post or comment URL.
 * Accepts URLs like:
 * - https://x.com/username/status/1234567890123456789
 * - https://twitter.com/username/status/1234567890123456789?s=20
 * - https://x.com/i/status/1234567890123456789
 * - /username/status/123456789
 */
export const validateAndParseXPostUrl = (inputUrl: string): ParsedXPostUrl => {
  const trimmed = inputUrl.trim();
  if (!trimmed) {
    return { valid: false, error: "URL cannot be empty" };
  }

  try {
    const absoluteUrl = trimmed.startsWith("http")
      ? trimmed
      : `https://x.com${trimmed.startsWith("/") ? "" : "/"}${trimmed}`;
    const urlObj = new URL(absoluteUrl);
    const fullUrl = `${urlObj.origin}${urlObj.pathname}`;
    const match = fullUrl.match(X_URL_REGEX);

    if (!match) {
      return {
        valid: false,
        error: "URL must be a valid X post URL (e.g., https://x.com/username/status/123456789)",
      };
    }

    const rawUsername = match[1];
    const username = rawUsername.startsWith("@") ? rawUsername.substring(1) : rawUsername;
    const postId = match[2];
    const normalizedUrl = `https://x.com/${username}/status/${postId}`;

    return {
      valid: true,
      username,
      postId,
      normalizedUrl,
    };
  } catch {
    return {
      valid: false,
      error: "Invalid URL format",
    };
  }
};

/**
 * Extracts post ID directly from an X post URL.
 */
export const extractPostId = (url: string): string | null => {
  const result = validateAndParseXPostUrl(url);
  return result.valid && result.postId ? result.postId : null;
};
