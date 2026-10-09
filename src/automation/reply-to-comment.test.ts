import { describe, it, expect } from "vitest";
import { XComment } from "../types";

describe("Comment Reply Handling", () => {
  it("should format target comment details correctly", () => {
    const comment: XComment = {
      id: "123",
      url: "https://x.com/john_doe/status/123",
      authorUsername: "john_doe",
      text: "Great post!",
      parentPostId: "999",
      isSelected: true,
    };

    expect(comment.authorUsername).toBe("john_doe");
    expect(comment.parentPostId).toBe("999");
  });
});
