export type AutomationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "POST_NOT_FOUND"
  | "POST_UNAVAILABLE"
  | "REPLY_COMPOSER_NOT_FOUND"
  | "REPLY_SUBMISSION_FAILED"
  | "NAVIGATION_FAILED"
  | "TIMEOUT"
  | "CANCELLED_BY_USER"
  | "RATE_LIMIT_EXCEEDED"
  | "COMMENT_TARGET_NOT_CONFIRMED"
  | "UNKNOWN";


export class AutomationError extends Error {
  public readonly code: AutomationErrorCode;
  public readonly screenshotPath?: string;

  constructor(code: AutomationErrorCode, message: string, screenshotPath?: string) {
    super(message);
    this.name = "AutomationError";
    this.code = code;
    this.screenshotPath = screenshotPath;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
