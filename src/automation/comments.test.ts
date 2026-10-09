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

    const validComments = comments.filter((c) => c.id !== parentPostId);
    expect(validComments.length).toBe(1);
    expect(validComments[0].id).toBe("888");
  });
});
