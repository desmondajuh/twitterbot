/**
 * Isolated selector map for X (formerly Twitter) frontend UI elements.
 * Priority order:
 * 1. Playwright semantic data-testid
 * 2. ARIA roles and labels
 * 3. Element text content fallbacks
 */
export const xSelectors = {
  // Indicators of user login state
  auth: {
    accountSwitcher: '[data-testid="SideNav_AccountSwitcher_Button"]',
    profileNav: '[aria-label="Profile"]',
    loginButton: '[data-testid="login"]',
    signupButton: '[data-testid="signup"]',
  },

  // Main Tweet / Post containers on status page
  post: {
    primaryTweet: '[data-testid="tweet"], article[data-testid="tweet"], [role="article"]',
    anyTweet: '[data-testid="tweet"], [role="article"], article[data-testid="tweet"]',
    cellInnerDiv: '[data-testid="cellInnerDiv"]',
    tweetText: '[data-testid="tweetText"]',
    notFoundNotice: '[data-testid="error-detail"]',
    rateLimitNotice: 'text="Rate limit exceeded", text="Try again later", text="Something went wrong"',
  },

  // Reply interaction elements
  reply: {
    // Inline reply box at the bottom of a main post thread or reply button on action bar
    inlineComposerTrigger: '[data-testid="tweetTextarea_0"]',
    actionReplyButton: '[data-testid="reply"]',
    // Rich contenteditable text container where user types reply text
    textbox: '[data-testid="tweetTextarea_0"]',
    textboxFallback: 'div[contenteditable="true"][role="textbox"], [data-testid="tweetTextarea_0InModal"]',
    // Reply submission button
    submitButton: '[data-testid="tweetButtonInline"]',
    submitButtonModal: '[data-testid="tweetButton"]',
    // Successful notification toast / message after reply
    successToast: '[data-testid="toast"]',
  },

  // Recipient / Conversation Controls
  recipients: {
    // "Replying to @..." header/button above the composer box
    replyingToTrigger: '[role="dialog"] button:has-text("Replying to"), [role="dialog"] [aria-label*="Replying to"], button:has-text("Replying to"), [data-testid="replyingToHeader"], [aria-label*="Replying to"]',
    // Modal or sheet popover that lists conversation recipients
    modalContainer: '[role="dialog"][aria-label*="Replying to"], [role="dialog"]',
    // "Others in this conversation" control / checkbox
    othersInConversationControl: '[aria-label*="Others in this conversation"], :has-text("Others in this conversation"), [data-testid*="othersInConversation"]',
    othersCheckbox: 'input[type="checkbox"], [role="checkbox"]',
    // Done / Save button on recipient selector popover
    doneButton: 'button:has-text("Done"), [data-testid="doneButton"], button:has-text("Save")',
  },
};
