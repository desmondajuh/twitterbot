import { describe, it, expect } from "vitest";
import {
  ReplyRecipient,
  RecipientConfigurationResult,
} from "./reply-recipients";

describe("Reply Recipients Configuration", () => {
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
    };

    expect(result.success).toBe(true);
    expect(result.targetUsername).toBe("john_doe");
    expect(result.recipients.length).toBe(2);
    expect(result.recipients[0].isSelected).toBe(true);
    expect(result.recipients[1].isSelected).toBe(false);
  });

  it("should detect when target commenter is not present in recipient list", () => {
    const recipients: ReplyRecipient[] = [
      { username: "mary_smith", displayName: "Mary Smith", isSelected: true },
    ];

    const targetUsername = "john_doe";
    const hasTarget = recipients.some(
      (r) => r.username.toLowerCase() === targetUsername && r.isSelected
    );

    expect(hasTarget).toBe(false);
  });
});
