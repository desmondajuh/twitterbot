import { describe, it, expect } from "vitest";
import { XComment } from "../types";

describe("Comment Discovery & Deduplication Logic", () => {
  it("should deduplicate comments by ID accurately", () => {
    const rawComments: XComment[] = [
      {
        id: "cmt_101",
        url: "https://x.com/user1/status/101",
        authorUsername: "user1",
        text: "First comment",
        parentPostId: "999",
        isSelected: false,
      },
      {
        id: "cmt_102",
        url: "https://x.com/user2/status/102",
        authorUsername: "user2",
        text: "Second comment",
        parentPostId: "999",
        isSelected: false,
      },
      {
        id: "cmt_101", // Duplicate
        url: "https://x.com/user1/status/101",
        authorUsername: "user1",
        text: "First comment",
        parentPostId: "999",
        isSelected: false,
      },
    ];

    const deduplicatedMap = new Map<string, XComment>();
    for (const c of rawComments) {
      if (!deduplicatedMap.has(c.id)) {
        deduplicatedMap.set(c.id, c);
      }
    }

    expect(deduplicatedMap.size).toBe(2);
    expect(Array.from(deduplicatedMap.keys())).toEqual(["cmt_101", "cmt_102"]);
  });

  it("should exclude the parent post ID from discovered comments", () => {
    const parentPostId = "999";
    const comments: XComment[] = [
      {
        id: "999", // Parent post ID!
        url: "https://x.com/author/status/999",
        authorUsername: "author",
        text: "Original Post Text",
        parentPostId: "999",
        isSelected: false,
      },
      {
        id: "888",
        url: "https://x.com/commenter/status/888",
        authorUsername: "commenter",
        text: "Actual reply text",
        parentPostId: "999",
        isSelected: false,
      },
    ];

    const validComments = comments.filter((c) => c.id !== parentPostId && !c.url.endsWith(`/status/${parentPostId}`));
    expect(validComments.length).toBe(1);
    expect(validComments[0].id).toBe("888");
  });

  it("should correctly extract username handles without timestamp or separator contamination", () => {
    const sampleRawUserNames = [
      "Author Display Name\n@author_one · 10m",
      "Crypto Enthusiast 🚀\n@crypto_guy\n·\nOct 5",
      "@verified_user · 2h",
      "Name With No Break @inline_handle · 1d",
    ];

    const extractedHandles = sampleRawUserNames.map((text) => {
      const match = text.match(/@([A-Za-z0-9_]{1,30})/);
      return match ? match[1] : null;
    });

    expect(extractedHandles).toEqual([
      "author_one",
      "crypto_guy",
      "verified_user",
      "inline_handle",
    ]);
  });

  it("should distinguish a comment status link from a parent post reply link", () => {
    const parentPostId = "123456789";
    const allStatusHrefsInComment = [
      `/parent_author/status/${parentPostId}`,
      `/replier/status/987654321`,
    ];

    // Find the comment's own status ID by skipping parentPostId
    let extractedCommentId = "";
    for (const href of allStatusHrefsInComment) {
      const match = href.match(/\/status\/(\d+)/);
      if (match && match[1] && match[1] !== parentPostId) {
        extractedCommentId = match[1];
        break;
      }
    }

    expect(extractedCommentId).toBe("987654321");
  });
});
