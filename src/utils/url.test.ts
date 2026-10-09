import { describe, it, expect } from "vitest";
import { validateAndParseXPostUrl, extractPostId } from "./url";

describe("URL Parsing & Validation Utility", () => {
  it("should extract post ID from standard x.com status URL", () => {
    const url = "https://x.com/user1/status/123456789";
    const result = validateAndParseXPostUrl(url);

    expect(result.valid).toBe(true);
    expect(result.postId).toBe("123456789");
    expect(result.username).toBe("user1");
    expect(result.normalizedUrl).toBe("https://x.com/user1/status/123456789");
  });

  it("should extract post ID from legacy twitter.com URL with query parameters", () => {
    const url = "https://twitter.com/test_user/status/987654321?s=20&t=abcdef";
    const result = validateAndParseXPostUrl(url);

    expect(result.valid).toBe(true);
    expect(result.postId).toBe("987654321");
    expect(result.username).toBe("test_user");
    expect(result.normalizedUrl).toBe("https://x.com/test_user/status/987654321");
  });

  it("should reject non-post X URLs (e.g. user profiles or settings)", () => {
    const profileUrl = "https://x.com/username";
    const result = validateAndParseXPostUrl(profileUrl);

    expect(result.valid).toBe(false);
    expect(result.error).toContain("must be a valid X post URL");
  });

  it("should reject completely invalid URLs", () => {
    const badUrl = "not-a-real-url";
    const result = validateAndParseXPostUrl(badUrl);

    expect(result.valid).toBe(false);
  });

  it("should extract post ID helper accurately", () => {
    expect(extractPostId("https://x.com/dev/status/5551234")).toBe("5551234");
    expect(extractPostId("https://google.com")).toBeNull();
  });
});
