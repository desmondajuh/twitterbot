# X Engagement Assistant — Roadmap, Improvements & Task Backlog

> **Document Type**: Technical Assessment & Actionable Task List  
> **Status**: Active / Prioritized  
> **Target Audience**: Core Developers & Contributors  
> **Last Updated**: October 2026  

---

## 1. Architectural Assessment & Current State

The **X Engagement Assistant** has a solid architectural foundation:
- Cross-platform Electron desktop shell with strict context isolation.
- Next.js 16 App Router UI with modern dark mode aesthetic.
- Robust recipient verification safety gate (`reply-recipients.ts`) ensuring replies do not accidentally tag unintended users or leave "Others in this conversation" checked.
- Bundled Chromium binary for zero-dependency end-user installation.

However, several **critical gaps**, **performance bottlenecks**, and **missing production features** must be addressed to transform this from a functional prototype into a resilient, production-ready desktop tool.

---

## 2. Priority 1: Critical Bug Fixes & Architecture Gaps

These tasks address immediate defects or architectural omissions that impact usability and data safety.

### 🟢 Task 1.1: Embedded SQLite Database for Jobs, Items & Settings [COMPLETED]
- **Status**: Completed & Verified.
- **Implemented**: Built an embedded, ACID-compliant **SQLite database** layer (`node:sqlite` in Node 22) located in `%APPDATA%/X Engagement Assistant/database.sqlite` (with local `./browser-data/database.sqlite` fallback).
  - Configured high-performance Write-Ahead Logging (`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`).
  - Implemented typed `JobsRepository` and `SettingsRepository` with indexes on `created_at`, `status`, and `job_id`.
  - Added automatic legacy migration: imports existing `jobs.json` and `settings.json` records on first boot without data loss.
  - Added cascading deletes (`ON DELETE CASCADE`) to clean up orphan items automatically.
  - Added quick-access "SQLite Database" folder opener to `/settings`.

---

### 🟢 Task 1.2: Persistent Settings & Wiring Configuration to Engine [COMPLETED]
- **Status**: Completed & Verified.
- **Implemented**: Implemented `settings:get` and `settings:update` IPC channels in `electron/ipc/settings.ipc.ts`, persisted config to `%APPDATA%/X Engagement Assistant/settings.json`, and wired `/settings` page directly with real-time feedback. Wired custom timeouts (`navigationTimeoutMs`, `actionTimeoutMs`, `maxRetries`, `keepBrowserOpenOnFinish`) directly into `JobProcessor` and `automation-service.ts`.

---

### 🟢 Task 1.3b: High-Volume Comment Reply Scaling & Batch Mode Default [COMPLETED]
- **Status**: Completed & Verified.
- **Resolution**:
  - Removed old 20-post restriction in `CreateJobSchema`, `DiscoverCommentsSchema`, and `ReplyCommentsSchema`.
  - Expanded job queue and discovery schema bounds to support up to 500 items per job (defaulting to 300 comments per run).
  - Promoted **Batch Mode** to the primary system default across UI forms, settings defaults, and backend schemas, allowing hands-free sequential execution of high-volume engagement campaigns without per-item prompt exhaustion.
  - Added dynamic scroll calculation (up to 200 scrolls; default: 120) and inline discovery limit input.

---

### 🔴 Task 1.3: In-App Interactive Confirmation Modal for "Safe Mode"
- **Issue**:
  - The CLI (`src/cli.ts`) supports per-post confirmation prompting via console readline.
  - In the desktop UI, when `confirmationMode === "per-post"`, `createReplyJob` does **not** register an `onConfirmationRequired` callback with the processor. The job executes like batch mode without pausing for human approval.
- **Action**:
  - Add an IPC event flow: when the processor reaches an item in `per-post` mode, emit `automation:confirm-request` with item details (`postUrl`, `authorUsername`, `replyMessage`).
  - Listen for this event in the Next.js UI (`/jobs` page or a global modal).
  - Present a modal dialog: **[Confirm & Send]**, **[Skip Item]**, or **[Cancel Remaining]**.
  - Send the decision back to the main process via `automation:confirm-response`.
  - Resume or skip the item in `JobProcessor`.
- **Target Files**:
  - `src/queue/processor.ts`
  - `electron/services/automation-service.ts`
  - `electron/preload.ts`
  - `src/app/jobs/page.tsx`
  - `src/components/common/confirmation-modal.tsx` (new)
- **Impact**: High | **Effort**: Medium

---

### 🔴 Task 1.4: Persistent Disk File Logging with Rotation
- **Issue**:
  - `src/automation/logger.ts` prints to `console.log` and broadcasts to active Electron windows.
  - Although `RuntimeConfig.getLogsPath()` creates `%APPDATA%/logs`, no log files are ever written to disk. If an automation error or crash occurs, diagnostic logs cannot be retrieved.
- **Action**:
  - Add file-appender logic in `logger.ts` or `electron/services/automation-service.ts` using Node `fs.createWriteStream` or a lightweight logger like `winston` / `pino`.
  - Rotate logs daily or when size exceeds 10MB (keep last 5 logs).
  - Add an "Open Logs Folder" button in the Settings UI using `electron.shell.openPath()`.
- **Target Files**:
  - `src/automation/logger.ts`
  - `electron/services/settings-service.ts`
  - `src/app/settings/page.tsx`
- **Impact**: High | **Effort**: Low

---

### 🔴 Task 1.5: Enforce Recipient Safety Gate on Direct Post Replies
- **Issue**:
  - `replyToComment` in `src/automation/reply-to-comment.ts` strictly calls `configureReplyRecipient` and `canSubmitReply`.
  - `processSinglePostReply` in `src/automation/reply-post.ts` does **not** invoke `configureReplyRecipient`. If a user inputs a post URL that is part of a thread, "Others in this conversation" will remain checked and unintentionally spam third parties.
- **Action**:
  - Import and call `configureReplyRecipient` and `canSubmitReply` in `processSinglePostReply` prior to submission.
- **Target Files**:
  - `src/automation/reply-post.ts`
- **Impact**: High | **Effort**: Low

---

## 3. Priority 2: Performance & Packaging Optimizations

These tasks reduce bundle size, eliminate memory overhead, and ensure application stability.

### 🟡 Task 2.1: Transition Next.js from Embedded Node Server to Static Export
- **Issue**:
  - In production (`electron/main.ts`), the app boots a full Next.js Node.js server via `require("next")` and `http.createServer`.
  - This requires bundling all Next.js server dependencies, consumes ~150MB+ extra RAM, slows down startup by 3–8 seconds, and creates port contention risks on `127.0.0.1:3000`.
- **Action**:
  - Set `output: 'export'` in `next.config.mjs`.
  - Since all core operations are routed through Electron's `contextBridge` IPC (`window.desktop.*`), the renderer is a pure client application that does not need server-side API routes in production.
  - Load the static `out/index.html` via `mainWindow.loadFile()` in Electron production mode.
  - Maintain the Next.js dev server relay only during `npm run dev`.
- **Target Files**:
  - `next.config.mjs`
  - `electron/main.ts`
  - `package.json`
- **Impact**: Very High | **Effort**: Medium

---

### 🟡 Task 2.2: Chromium Packaging & Bundle Size Optimization
- **Issue**:
  - The packaged installer is >400MB because the entire Playwright Chromium folder is copied into `build/chromium` without filtering.
- **Action**:
  - In `scripts/package-chromium.js`, exclude test fixtures, non-essential locales (`locales/` except `en-US`), and debug symbols (`.pdb` files on Windows).
  - Add optional fallback support to use the machine's existing Google Chrome or Microsoft Edge installation (`channel: 'chrome'` or `channel: 'msedge'`) if the user chooses not to bundle Chromium.
- **Target Files**:
  - `scripts/package-chromium.js`
  - `src/automation/browser/browser-manager.ts`
  - `electron-builder.json`
- **Impact**: Medium | **Effort**: Low to Medium

---

### 🟡 Task 2.3: Browser Concurrency Mutex & Multi-Tab Isolation
- **Issue**:
  - `BrowserManager` is a singleton with a single `activeContext`.
  - If a user clicks "Launch & Sign in X" while a comment discovery job or reply queue is active, both operations share the exact same `page` or fight for navigation focus.
- **Action**:
  - Implement a simple lock / mutex in `BrowserManager`:
    - `isBusy()` state flag.
    - If automation is running, opening manual browser opens a dedicated secondary tab (`context.newPage()`) instead of reusing the automation tab.
    - Disable or show a badge on the "Launch & Sign in X" button while an active job is executing.
- **Target Files**:
  - `src/automation/browser/browser-manager.ts`
  - `electron/services/browser-service.ts`
  - `src/components/browser/launch-x-button.tsx`
- **Impact**: Medium | **Effort**: Low

---

### 🟡 Task 2.4: Prevent Zombie Browser & Node Processes on Crash
- **Issue**:
  - If the Electron application crashes or is killed via Task Manager, child Chromium instances launched by Playwright can remain running orphaned in the background, consuming CPU and holding file locks on `%APPDATA%/browser-profile`.
- **Action**:
  - Store child process PID when Chromium launches.
  - Register `process.on('exit')`, `process.on('SIGINT')`, `process.on('uncaughtException')`, and `app.on('will-quit')` handlers to kill all child Chromium processes.
  - On application startup, check for stale profile locks (`SingletonLock` in `browser-profile`) and clean them safely.
- **Target Files**:
  - `electron/main.ts`
  - `src/automation/browser/browser-manager.ts`
- **Impact**: High | **Effort**: Low

---

## 4. Priority 3: Anti-Bot & Automation Hardening

These tasks ensure long-term reliability against X frontend changes and anti-automation algorithms.

### 🟡 Task 3.1: Resilient Multi-Layered Selector Engine
- **Issue**:
  - X frequently updates frontend DOM attributes, obfuscates class names, and occasionally modifies `data-testid` values.
- **Action**:
  - Implement a selector cascade in `x-selectors.ts`:
    1. Primary: `data-testid` (e.g. `[data-testid="tweetTextarea_0"]`)
    2. Secondary: ARIA attributes (e.g. `[aria-label="Post text"], [role="textbox"]`)
    3. Tertiary: Semantic DOM hierarchy & text matching (e.g. `div[contenteditable="true"]`)
  - Add self-healing timeout detection that captures a DOM snapshot if all selectors fail, making selector updates easy to diagnose.
- **Target Files**:
  - `src/automation/x-selectors.ts`
  - `src/automation/x-client.ts`
- **Impact**: High | **Effort**: Medium

---

### 🟡 Task 3.2: Humanized Cursor Simulation & Mouse Movement
- **Issue**:
  - Clicking elements directly via `locator.click()` teleports the cursor instantaneously, which modern bot-detection scripts (e.g., Cloudflare, Arkose Labs) flag as synthetic interaction.
- **Action**:
  - Use Playwright's `page.mouse.move()` to simulate realistic Bézier curve mouse paths between elements before clicking.
  - Add random slight overshoot and micro-pauses.
- **Target Files**:
  - `src/automation/x-client.ts`
- **Impact**: Medium | **Effort**: Medium

---

### 🟡 Task 3.3: Automatic Circuit Breakers for Account Protection
- **Issue**:
  - If an account gets rate-limited, flagged with a CAPTCHA, or temporarily locked, the queue might blindly continue retrying, escalating the risk of account suspension.
- **Action**:
  - Implement automated circuit breaker detection in `XClient`:
    - Detect Arkose CAPTCHA frames (`iframe[src*="arkoselabs"]`).
    - Detect "Your account has been locked / Suspended" prompts.
    - Detect 3 consecutive rate-limit errors.
  - When triggered:
    - **Instantly pause the entire queue**.
    - Capture a full-page diagnostic screenshot.
    - Play an alert sound and trigger a desktop notification (`new Notification(...)`).
- **Target Files**:
  - `src/automation/x-client.ts`
  - `src/queue/processor.ts`
  - `electron/services/automation-service.ts`
- **Impact**: Very High | **Effort**: Medium

---

### 🟡 Task 3.4: Proxy & User-Agent Configuration
- **Action**:
  - Allow users to enter an HTTP / SOCKS5 proxy (`host:port:username:password`) in Settings.
  - Pass the proxy configuration to `chromium.launchPersistentContext(..., { proxy: { ... } })`.
  - Useful for users managing multiple accounts or operating from restricted network environments.
- **Target Files**:
  - `src/automation/browser/browser-manager.ts`
  - `src/app/settings/page.tsx`
  - `electron/services/settings-service.ts`
- **Impact**: Medium | **Effort**: Low to Medium

---

## 5. Priority 4: Feature Additions & UX Enhancements

These tasks expand the product's functional capabilities and user delight.

### 🟢 Task 4.1: Dynamic Reply Templates & Spintax Support
- **Purpose**: Avoid sending the exact same text to 20 different users, which triggers X's duplicate content spam filter.
- **Features**:
  - **Variable Substitution**:
    - `{username}`: Replaces with the commenter's handle (e.g. `@johndoe`).
    - `{display_name}`: Replaces with author's name.
  - **Spintax Syntax**:
    - `{Hi|Hello|Hey} {great|awesome|insightful} {post|point|comment}!`
    - Parses and randomly selects variations for each recipient.
- **Target Files**:
  - `src/utils/spintax.ts` (new)
  - `src/app/page.tsx`
  - `src/queue/processor.ts`
- **Impact**: High | **Effort**: Low to Medium

---

### 🟢 Task 4.2: AI Reply Assistant (BYO API Key or Local LLM)
- **Purpose**: Generate high-context, educational, or conversational reply suggestions based on the original tweet text.
- **Features**:
  - Settings option to provide an API key (OpenAI, Anthropic Claude, Google Gemini, or Ollama local endpoint).
  - "Suggest Reply with AI" button on the comment selection panel.
  - User can choose tone (e.g., Professional, Inquisitive, Friendly, Educational).
  - Drafts are presented for review/editing before queue insertion.
- **Target Files**:
  - `src/services/ai-reply-service.ts` (new)
  - `src/app/page.tsx`
  - `src/app/settings/page.tsx`
- **Impact**: High | **Effort**: Medium

---

### 🟢 Task 4.3: Multi-Account Profile Manager
- **Purpose**: Support managing multiple X accounts without logging in and out repeatedly.
- **Features**:
  - Named profiles (e.g., "Personal Account", "Brand Account", "Research Account").
  - Each profile stores its own isolated browser directory: `%APPDATA%/profiles/<profile_id>`.
  - Dropdown in top navigation bar to switch the active profile.
- **Target Files**:
  - `src/automation/browser/browser-profile.ts`
  - `electron/services/browser-service.ts`
  - `src/app/layout.tsx`
- **Impact**: Medium | **Effort**: Medium

---

### 🟢 Task 4.4: Scheduled & Drip Campaign Mode
- **Purpose**: Drip replies across extended time frames (e.g., send 1 reply every 15–30 minutes) to emulate natural user activity throughout the day.
- **Features**:
  - Toggle between **Immediate Sequential** vs. **Drip Schedule**.
  - Configure interval min/max (e.g., 10m to 25m).
  - Ability to pause and resume the schedule.
- **Target Files**:
  - `src/queue/processor.ts`
  - `src/app/page.tsx`
- **Impact**: Medium | **Effort**: Medium

---

### 🟢 Task 4.5: Engagement Analytics & CSV/JSON Export
- **Purpose**: Enable users to review performance and archive engagement records.
- **Features**:
  - "Export Job" button on the Jobs Dashboard.
  - Exports a CSV or JSON file containing: Job ID, Timestamp, Post URL, Recipient Handle, Original Comment Text, Reply Message, Status, Error Message (if any).
- **Target Files**:
  - `src/app/jobs/page.tsx`
  - `src/utils/export.ts` (new)
- **Impact**: Medium | **Effort**: Low

---

### 🟢 Task 4.6: In-App Streaming Log Viewer / Terminal Drawer
- **Purpose**: Allow users to monitor real-time browser actions without opening DevTools.
- **Features**:
  - Collapsible terminal drawer at the bottom of the desktop window.
  - Streaming log messages color-coded by level (`INFO` in blue, `WARN` in amber, `ERROR` in red).
  - Clear and Copy Log buttons.
- **Target Files**:
  - `src/components/common/log-viewer.tsx` (new)
  - `src/app/layout.tsx`
- **Impact**: Medium | **Effort**: Low to Medium

---

## 6. Priority 5: Code Cleanup & Dead File Removal

These maintenance tasks keep the repository clean and manageable.

### 🧹 Task 5.1: Clean Dead & Duplicate Files
- **Remove**:
  - `next-env.d-1.ts` (untracked duplicate of `next-env.d.ts`).
  - `CLAUDE.md` (empty 11-byte placeholder).
  - `standalone.md` (redundant initial prompt; replaced by `APP_OVERVIEW.md` and this document).
- **Target Files**:
  - Delete `next-env.d-1.ts`
  - Delete `CLAUDE.md`
  - Remove or archive `standalone.md`
- **Impact**: Low | **Effort**: Trivial

---

### 🧹 Task 5.2: Unify API Routes vs. IPC Redundancy
- **Issue**:
  - There are dual paths for almost every operation: Electron IPC (`electron/ipc/*`) and Next.js API routes (`src/app/api/*`).
  - Maintaining both duplicates business logic and introduces subtle divergences (e.g., different retry handling).
- **Action**:
  - In desktop mode, route all frontend actions strictly through `window.desktop.*`.
  - Maintain API routes only if a standalone web-hosted server mode is an explicit requirement. If the product is strictly a desktop application, remove `/api/*` routes to simplify the codebase.
- **Target Files**:
  - `src/app/api/`
  - `src/app/page.tsx`
  - `src/app/jobs/page.tsx`
- **Impact**: Medium | **Effort**: Medium

---

### 🧹 Task 5.3: Add Automated Linter & Prettier Workflow
- **Action**:
  - Add ESLint config for TypeScript, React, and Next.js.
  - Add Prettier formatting script (`pnpm run format`).
  - Add GitHub Actions CI workflow to run `pnpm test` and `pnpm lint` on every pull request.
- **Target Files**:
  - `.github/workflows/ci.yml`
  - `.eslintrc.json`
  - `.prettierrc`
- **Impact**: Medium | **Effort**: Low

---

## 7. Master Prioritized Task Matrix

| ID | Task Name | Category | Priority | Effort | Impact | Status |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| **1.1** | Persistent Storage for Jobs & History (`jobs.json`) | Core Stability | 🔴 P1 | Medium | High | ✅ **Completed** |
| **1.2** | Persist System Settings & Wire to Automation Engine | Core Stability | 🔴 P1 | Low | High | ✅ **Completed** |
| **1.3** | Desktop UI Safe Mode Interactive Approval Modal | Core Feature | 🔴 P1 | Medium | High | ✅ **Completed** |
| **1.4** | Persistent Disk File Logging with Rotation (`app.log`) | Diagnostics | 🔴 P1 | Low | High | ✅ **Completed** |
| **1.5** | Enforce Recipient Safety Gate on Direct Post Replies | Safety Gate | 🔴 P1 | Low | High | ✅ **Completed** |
| **2.1** | Transition Next.js to Static Export (`output: 'export'`) | Performance | 🟡 P2 | Medium | Very High | ⏳ Pending |
| **2.2** | Chromium Bundle Size Optimization & Local Channel Fallback | Packaging | 🟡 P2 | Low | Medium | ⏳ Pending |
| **2.3** | Browser Manager Concurrency Mutex & Multi-Tab Isolation | Stability | 🟡 P2 | Low | Medium | ⏳ Pending |
| **2.4** | Zombie Chromium Process Cleanup on Exit & Crash | Reliability | 🟡 P2 | Low | High | ⏳ Pending |
| **3.1** | Resilient Multi-Layered Selector Cascade & DOM Snapshots | Automation | 🟡 P2 | Medium | High | ⏳ Pending |
| **3.2** | Humanized Bézier Curve Cursor Movement & Jitter | Anti-Bot | 🟡 P2 | Medium | Medium | ⏳ Pending |
| **3.3** | Account Safety Circuit Breakers (CAPTCHA/Lockout Detect) | Safety | 🟡 P2 | Medium | Very High | ⏳ Pending |
| **3.4** | Proxy & User-Agent Configuration in Settings | Network | 🟡 P2 | Low | Medium | ⏳ Pending |
| **4.1** | Dynamic Reply Templates & Spintax Syntax Support | UX / Feature | 🟢 P3 | Low | High | ⏳ Pending |
| **4.2** | AI Reply Assistant (OpenAI, Claude, Gemini, Local LLM) | UX / Feature | 🟢 P3 | Medium | High | ⏳ Pending |
| **4.3** | Multi-Account Profile Manager | UX / Feature | 🟢 P3 | Medium | Medium | ⏳ Pending |
| **4.4** | Scheduled & Drip Campaign Mode (Interval Delays) | UX / Feature | 🟢 P3 | Medium | Medium | ⏳ Pending |
| **4.5** | Engagement Analytics & CSV / JSON Data Export | Data | 🟢 P3 | Low | Medium | ⏳ Pending |
| **4.6** | In-App Real-Time Log Viewer / Terminal Drawer | Diagnostics | 🟢 P3 | Low | Medium | ⏳ Pending |
| **5.1** | Remove Dead Files (`next-env.d-1.ts`, `CLAUDE.md`, etc.) | Hygiene | 🧹 P4 | Trivial | Low | ✅ **Completed** |
| **5.2** | Unify IPC Layer & Retire Redundant `/api/*` Routes | Maintenance | 🧹 P4 | Medium | Medium | ⏳ Pending |
| **5.3** | Setup ESLint, Prettier & CI Verification Pipeline | Tooling | 🧹 P4 | Low | Medium | ⏳ Pending |
