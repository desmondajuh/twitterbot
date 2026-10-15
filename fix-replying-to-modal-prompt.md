# Fix the X.com "Replying to" Modal Recipient Selection Logic

## Objective

Inspect and fix the existing Playwright automation that configures
recipients in X.com's **"Replying to"** modal.

The current implementation tries to deselect "Others in this
conversation," but its interactions are incorrect. It must distinguish
the intended comment author from additional conversation participants,
inspect current checkbox states, deselect only the additional
participants, and verify the result before continuing.

**Important: all usernames and names in this document are illustrative
examples taken from the reference screenshot. They are NOT hardcoded
targets.** In particular, `Tobi 4L` and `@t0bi_4l` are examples only.
**Do not search X for `@t0bi_4l`, do not hardcode this username into the
application, and do not assume that this is the target for every
reply.** At runtime, derive the target dynamically from the comment the
user selected and the existing comment data/model. The target may be any
username.

## Reference screenshots

Use the attached image `replying to.png` as the visual reference. It
shows three recipient-modal states.

### Image 1 --- Target user only

The modal contains the target commenter at the top, with a selected,
gray/disabled checkbox. There is no **"Others in this conversation"**
section.

**Expected behavior:** Do not click any recipient checkbox. Confirm the
target is selected and that there are no additional recipients. Continue
without changing recipient selection.

### Image 2 --- Target plus one additional recipient

The modal contains the target at the top and one additional participant
under **"Others in this conversation."** The additional participant's
checkbox is selected.

**Expected behavior:** Deselect only that additional participant. Keep
the target selected.

The additional participant may be toggled by clicking the checkbox or
another interactive part of its row, such as the avatar or username.
Prefer the checkbox when it can be reliably identified. Use a row-click
fallback only after inspecting the DOM and confirming the row's
behavior.

This is expected to be the most common case, so implement and test it
first.

### Image 3 --- Target plus multiple additional recipients

The modal contains the target at the top and multiple additional
participants under **"Others in this conversation."** A group checkbox
appears beside that section heading.

**Expected behavior:** If the group checkbox is present, its behavior is
understood, and its current state indicates that recipients are
selected, use it to deselect the additional recipients as a group. Then
inspect each additional recipient and verify that all are unchecked. If
the group control is unavailable or its behavior cannot be confirmed,
handle recipients individually.

Do not assume that the group checkbox controls only additional
recipients until this has been confirmed through DOM inspection and
controlled testing.

------------------------------------------------------------------------

## 1. Inspect the existing implementation first

Before editing code:

1.  Inspect the repository and identify the current recipient-management
    implementation.
2.  Locate the functions that open the "Replying to" modal and interact
    with its controls.
3.  Find how the selected comment and its author are represented in the
    existing types/data.
4.  Determine how the current code identifies the target, individual
    recipient rows, and group checkbox.
5.  Check whether it blindly clicks checkboxes, uses an overly broad
    selector, targets the wrong section, or acts before the modal has
    finished rendering.
6.  Check whether custom X.com controls are native checkboxes or custom
    elements.
7.  Identify existing logging, error handling, and tests.

Reuse the existing architecture. Do not create a duplicate recipient
module or rewrite unrelated working automation.

Provide a concise diagnosis of the root cause before implementing the
fix.

## 2. Derive the target dynamically --- never hardcode the example username

The intended recipient is **the author of the comment the user selected
for replying**, not a fixed account.

For example, the screenshot happens to show `Tobi 4L` / `@t0bi_4l`. This
is merely sample UI content used to explain the expected behavior. In
real usage, the selected comment could have been written by someone
else.

Requirements:

-   Obtain the expected target username from the selected comment's
    existing data/model.
-   Normalize usernames consistently for comparison, including whether
    the stored value includes `@`.
-   Compare the expected target against the actual target recipient
    displayed in the modal.
-   Do not search X for the sample username in this prompt.
-   Do not add `@t0bi_4l` or `Tobi 4L` as a constant, default, fallback,
    or special case in production code.
-   Use realistic fixture data in tests, but make tests demonstrate that
    different target usernames work.
-   If the selected comment's author cannot be identified or the modal's
    target does not match it, fail safely without changing recipients or
    submitting a reply.

Use a variable such as `expectedTargetUsername` to express the runtime
target.

## 3. Required selection rules

Always preserve the target recipient and deselect additional
participants.

  -----------------------------------------------------------------------
  Modal state                         Required behavior
  ----------------------------------- -----------------------------------
  Target only; no additional          Do nothing to checkboxes; verify
  recipients                          target

  Target plus one selected additional Uncheck only that additional
  recipient                           recipient

  Target plus one already-unchecked   Do not click; verify state
  additional recipient                

  Target plus multiple selected       Uncheck the group, then verify
  additional recipients and a         every additional recipient
  verified group checkbox             

  Target plus multiple recipients,    Inspect and uncheck selected
  but group control is                additional recipients individually
  unavailable/unverified              

  Any unknown or unverifiable state   Fail closed; do not submit
  -----------------------------------------------------------------------

Never click the target's checkbox. The target is normally shown as
selected and disabled, but still verify its identity and state.

## 4. Never blindly toggle checkboxes

A click toggles state. Clicking an already-unchecked checkbox can select
it, which is the opposite of the intended behavior.

Incorrect pattern:

``` ts
await checkbox.click();
```

Preferred pattern for a native checkbox:

``` ts
const isSelected = await checkbox.isChecked();

if (isSelected) {
  await checkbox.uncheck();
}

if (await checkbox.isChecked()) {
  throw new Error("ADDITIONAL_RECIPIENT_STILL_SELECTED");
}
```

Adapt this to the actual DOM. X.com may use custom controls, so
`isChecked()` may not be applicable. For custom controls, inspect
accessible roles, labels, `aria-checked`, disabled state, and the real
interaction behavior. Do not infer state from color alone.

After an interaction, verify the resulting state. Never treat a
successful click as proof that the checkbox changed.

## 5. Use semantic, scoped selectors

Prefer Playwright locators based on accessible roles, labels, and text,
scoped to the relevant dialog and section. Examples include
`getByRole()`, `getByText()`, and `getByLabel()`.

Identify the **"Others in this conversation"** section first, then find
additional participant rows and their controls within that section. Do
not use a generic selector that can accidentally select the target
checkbox or an unrelated checkbox.

Avoid unstable generated CSS class names when semantic relationships are
available. Inspect the real DOM before choosing selectors. Keep
selectors centralized in the project's existing selector module when
appropriate.

Do not identify the target merely by choosing the first checkbox in the
modal. The modal can contain a target checkbox, a group checkbox,
individual recipient checkboxes, and other controls.

## 6. Image 1: no additional recipients

When only the target recipient is present:

1.  Wait for the modal to become visible.
2.  Identify the target from the selected comment's author data.
3.  Verify the displayed target matches the expected target.
4.  Verify the target is selected and disabled/non-interactable as
    appropriate.
5.  Confirm the additional-recipient section is absent or contains zero
    participants.
6.  Do not click any checkbox.
7.  Return success with `changed: false` and zero additional recipients.

The absence of the "Others in this conversation" section is not an error
if the target is correctly identified and no additional recipients
exist.

## 7. Image 2: one additional recipient

Implement this scenario first because it is the most common.

1.  Identify and verify the target dynamically from the selected
    comment.
2.  Locate the "Others in this conversation" section.
3.  Identify the additional participant row and its checkbox.
4.  Read its current state.
5.  If selected, deselect that additional participant only.
6.  If already unchecked, do not click it.
7.  Re-read the checkbox state and verify it is unchecked.
8.  Verify the target remains selected and unchanged.
9.  Click **Done** only after verification succeeds.
10. If possible, verify the recipient configuration again after the
    modal closes.

If direct checkbox interaction is unreliable, inspect the DOM to
establish which row interactions toggle that recipient. A click on the
avatar, username, display name, or row is allowed only if its
relationship to the intended recipient is confirmed. After using a
fallback interaction, re-read the state. Do not blindly retry clicks.

## 8. Image 3: multiple additional recipients

1.  Identify and verify the target dynamically.
2.  Locate the "Others in this conversation" section.
3.  Enumerate the additional participant rows within that section.
4.  Locate the group checkbox associated with the section heading.
5.  Determine its current state and confirm through inspection/testing
    that it controls additional recipients, not the target.
6.  If it is selected and its behavior is verified, click it once to
    deselect the group.
7.  Wait for the UI to update.
8.  Re-query the participant rows after any rerender.
9.  Inspect every additional recipient individually and verify each is
    unchecked.
10. If any remain selected, deselect them individually and verify again.
11. Verify the target remains selected.
12. Click **Done** only after all checks pass.

If the group checkbox is already unchecked, do not toggle it. If the
group checkbox is missing, ambiguous, or unverified, use individual
controls. Handle indeterminate/mixed state explicitly rather than
assuming its meaning.

## 9. Suggested types and helper functions

Adapt these suggestions to existing project types; do not duplicate
existing equivalents.

``` ts
interface RecipientRowState {
  username: string;
  displayName?: string;
  selected: boolean;
  disabled: boolean;
}

interface RecipientConfigurationResult {
  success: boolean;
  targetUsername: string;
  additionalRecipientsFound: number;
  additionalRecipientsDeselected: number;
  changed: boolean;
  error?: string;
}
```

Potential helpers:

-   `openReplyingToModal()`
-   `findTargetRecipient(expectedTargetUsername)`
-   `verifyTargetRecipient(expectedTargetUsername)`
-   `findAdditionalRecipientsSection()`
-   `findAdditionalRecipientRows()`
-   `findGroupRecipientCheckbox()`
-   `readRecipientCheckboxState()`
-   `deselectAdditionalRecipient()`
-   `deselectAllAdditionalRecipients()`
-   `verifyAllAdditionalRecipientsDeselected()`
-   `closeRecipientModal()`
-   `configureReplyRecipients()`

Keep the implementation focused and maintainable. Create only the
helpers that materially improve the existing code.

## 10. Recommended algorithm

Implement the following behavior against the actual DOM:

``` ts
async function configureReplyRecipients(
  page: Page,
  expectedTargetUsername: string
): Promise<RecipientConfigurationResult> {
  // Wait for the recipient modal to be visible.

  // Identify the target using expectedTargetUsername,
  // which comes from the selected comment at runtime.
  // Never use a hardcoded example username.

  // Verify the modal target matches the selected comment author.
  // Never interact with the target checkbox.

  // Find the "Others in this conversation" section.

  // If no additional recipients exist:
  // return success without clicking any checkbox.

  // If one additional recipient exists:
  // inspect its current state and uncheck only if selected.

  // If multiple additional recipients exist:
  // use the verified group checkbox if available and appropriate;
  // otherwise uncheck selected recipients individually.

  // Verify all additional recipients are unchecked.
  // Verify the target remains selected.
  // Return a structured result.
}
```

This is pseudocode, not a ready-made selector implementation. Use the
repository's actual types, helpers, and DOM structure.

## 11. Dynamic UI and rerendering

X.com is a dynamic React application.

-   Use Playwright's auto-waiting and state assertions.
-   Wait for expected state changes rather than adding arbitrary long
    sleeps.
-   Re-query controls after the UI rerenders.
-   Do not rely on stale element handles after group toggles.
-   Distinguish a modal that has not loaded yet from a modal that
    genuinely has no additional recipients.
-   Fail safely if the modal or recipient state cannot be reliably
    identified.

## 12. Integrate with the existing reply flow

Preserve the existing comment discovery and reply functionality.

The workflow must be:

1.  User selects a comment.
2.  Verify the selected comment and obtain its author username from
    existing comment data.
3.  Open the reply composer for that comment.
4.  Open the "Replying to" modal.
5.  Configure recipients using the dynamic target username.
6.  Preserve the target and deselect additional participants.
7.  Verify all recipient states.
8.  Click **Done**.
9.  Enter and verify the reply text.
10. Perform the existing final target/recipient safety check.
11. Submit only if all checks pass.

If recipient configuration fails, return a structured failure result and
stop that reply operation. Do not silently continue.

Use or adapt error codes such as:

-   `COMMENT_TARGET_NOT_CONFIRMED`
-   `TARGET_RECIPIENT_NOT_SELECTED`
-   `ADDITIONAL_RECIPIENT_STILL_SELECTED`
-   `RECIPIENT_STATE_UNKNOWN`
-   `RECIPIENT_MODAL_NOT_FOUND`
-   `RECIPIENT_CONFIGURATION_FAILED`

The guiding rule remains: **unverified target or recipient state = do
not submit**.

## 13. Logging

Add useful, non-sensitive logs. For example:

``` text
[Recipients] Opening recipient modal
[Recipients] Expected target loaded from selected comment
[Recipients] Target recipient verified
[Recipients] Additional recipient count: 1
[Recipients] Additional recipient currently selected
[Recipients] Deselecting additional recipient
[Recipients] Additional recipient verified unchecked
[Recipients] Target remains selected
[Recipients] Recipient configuration verified
[Recipients] Modal closed
```

Do not log credentials, cookies, tokens, or private session data. On
failure, capture a screenshot if the existing debugging system supports
it.

## 14. Tests

Use controlled HTML fixtures/mocks for unit or integration tests. Do not
rely on live X.com for every test.

### Test A --- Target only

-   Target selected and disabled.
-   No additional-recipient section.
-   Expect success, no checkbox clicks, and `changed: false`.

### Test B --- One selected additional recipient

-   Target selected and disabled.
-   One additional recipient selected.
-   Expect only the additional recipient to be unchecked.

### Test C --- One already-unchecked additional recipient

-   Expect no unnecessary click and correct final state.

### Test D --- Multiple selected additional recipients

-   Group checkbox is available and its behavior is verified.
-   Expect all additional recipients to end unchecked.
-   Verify each individual recipient and preserve the target.

### Test E --- Group checkbox already unchecked

-   Do not toggle it.
-   Verify individual states.

### Test F --- Group checkbox unavailable

-   Fall back to individually inspecting and deselecting additional
    recipients.

### Test G --- Target mismatch or missing target

-   Fail safely.
-   Do not change recipients.
-   Do not submit.

### Test H --- Unknown checkbox state

-   Return a structured error.
-   Do not guess or submit.

### Test I --- Different target usernames

-   Use at least two different target usernames in fixtures.
-   Verify the code derives the expected target from each selected
    comment.
-   Confirm no test or production path depends on the screenshot's
    example username.

### Test J --- UI rerenders after a toggle

-   Re-query controls and verify the actual final states.

Do not submit an actual reply just to test the recipient selector.
Validate recipient configuration independently first.

## 15. Manual verification with the screenshot scenarios

Use the attached `replying to.png` as a visual guide and test all three
layouts against the actual UI when available.

-   **Image 1:** No recipient checkbox action.
-   **Image 2:** Only the additional recipient is deselected.
-   **Image 3:** All additional recipients are deselected, using the
    verified group control when appropriate.

In every scenario, the target is the author of the comment currently
being replied to. The screenshot's `Tobi 4L` / `@t0bi_4l` is an example,
not a fixed account to search for or target.

Do not submit actual replies during initial recipient-selector
validation.

## 16. Definition of done

The fix is complete when:

-   The target is dynamically derived from the selected comment.
-   No username from the reference screenshot is hardcoded into
    production logic.
-   The target recipient is never clicked or deselected.
-   Image 1 requires no checkbox interaction.
-   Image 2 deselects only the single additional recipient.
-   Image 3 deselects all additional recipients, using the verified
    group control when possible.
-   Already-unchecked controls are not toggled.
-   Final states are verified, not assumed from clicks.
-   Recipient uncertainty stops the operation before submission.
-   Existing comment discovery and other working functionality remain
    intact.
-   Tests and manual verification results are documented.

**Core principle: preserve the actual selected comment's author,
deselect additional recipients, and verify the resulting state before
proceeding.**
