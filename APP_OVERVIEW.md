# X Engagement Assistant — Application Documentation & Existing Features

> **Document Status**: Living Document  
> **Last Updated**: October 2026  
> **Version**: 0.1.0  
> **Maintainer Notice**: Update this document whenever new features, architecture changes, IPC methods, or configuration options are introduced.

---

## 1. Executive Summary & Purpose

**X Engagement Assistant** is a cross-platform desktop application built with **Electron**, **Next.js 16 (App Router)**, **TypeScript**, and **Playwright**. It provides controlled, human-in-the-loop browser automation for engaging with posts and comments on **X (formerly Twitter)**.

The software is engineered for educational, compliance-focused, and high-precision social engagement. Unlike conventional headless bots that scrape private APIs or trigger anti-bot bans, X Engagement Assistant operates through a real, persistent Chromium browser profile on the user's machine, simulating human interaction with keystroke jitter, randomized delays, and strict recipient verification gates.

---

## 2. High-Level Architecture & Data Flow

The application is structured into four primary layers:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Electron Desktop Shell                         │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Next.js 16 UI (Renderer)                       │  │
│  │                                                                   │  │
│  │  • New Job (Post / Comment Workflows)                             │  │
│  │  • Comment Discovery, Filter, & Multi-Select                      │  │
│  │  • Jobs & Progress Queue Dashboard                               │  │
│  │  • System Settings & Diagnostics                                  │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │                                    │
│                         Secure ContextBridge IPC                        │
│                         (window.desktop.* API)                          │
│                                    │                                    │
│  ┌─────────────────────────────────▼─────────────────────────────────┐  │
│  │                     Electron Main Process                         │  │
│  │                                                                   │  │
│  │  • Main Window Manager (single instance lock, autoHideMenuBar)    │  │
│  │  • IPC Routing (automation, browser, settings)                    │  │
│  │  • Embedded Next.js Server (Production) / Dev Server Relay        │  │
│  │  • RuntimeConfig & Platform Storage Paths                         │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │                                    │
│  ┌─────────────────────────────────▼─────────────────────────────────┐  │
│  │                   Playwright Automation Core                      │  │
│  │                                                                   │  │
│  │  • BrowserManager (singleton persistent context)                  │  │
│  │  • JobQueue & Sequential JobProcessor                             │  │
│  │  • Anti-Detection Evasions (webdriver, languages, plugins)        │  │
│  │  • Recipient Safety Gate (uncheck 'Others in conversation')       │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
└────────────────────────────────────┼────────────────────────────────────┘
                                     │
                                     ▼
                            X.com (Live Browser)
```

### Security & Sandboxing Standard
- **Renderer Isolation**: Next.js runs in an isolated Chromium renderer with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- **Zero Raw Node Access**: React components cannot invoke `fs`, `child_process`, or raw Node APIs. All privileged operations go through typed IPC handlers exposed via `electron/preload.ts`.
- **Local Automation**: All browsing occurs locally on the user's computer using their own IP and session profile.

---

## 3. Existing Features & Capabilities

### 3.1. Workflow 1: Comment Discovery & Selective Replying
Designed for finding engaged users under any high-traffic or niche tweet:
1. **Target URL Input**: Accepts any valid X post URL (validates format, extracts status ID and username).
2. **Exclusion / Blacklist Input**: Allows specifying usernames (e.g. `@bot, @spammer`) that should never be replied to and will be forcefully unchecked if present in reply recipients.
3. **Automated Discovery Engine**:
   - Opens the persistent Chromium browser to the target post.
   - Automatically dismisses popups, overlays, and "Views" modals.
   - Dynamic Discovery Limit: Configurable limit up to 500 comments (default: 300) with an inline UI limit control.
   - Scrolls down progressively up to `maxScrolls` (dynamically calculated up to 200 scrolls; default: 120) with delays to trigger lazy-loaded comments.
   - Stops early if no new comments appear after consecutive scrolls (`noNewCommentsLimit: 8`).
   - Extracts comment text, author handle, author display name, timestamp, and status URL.
   - Ignores status links that point back to the parent post.
4. **Interactive Comment Selection UI**:
   - Live text search across username, display name, and comment content.
   - Filter tabs: **All**, **Selected**, and **Unselected**.
   - Bulk actions: **Select All** and **Clear All**.
   - Individual checkbox toggle on each comment card.
5. **Reply Composer & Character Counter**:
   - Character count indicator (max 280 characters) with warning colors (>240 amber, >280 red).
6. **Confirmation Mode Toggle**:
   - **Batch Mode (Default)**: Single approval before launching execution; runs sequentially through the queue with real-time item status and progress tracking.
   - **Safe Mode (Per-Comment / Per-Post)**: Pauses before submitting each reply to require manual user confirmation.
7. **High-Volume Job Capacity**:
   - Supports batch reply jobs up to 500 items (default: 300 items) per execution queue.
8. **Preview Modal**:
   - Visual review card showing the target comments, authors, and preview of reply before starting the job.

### 3.2. Workflow 2: Direct Post Reply Mode
Designed for engaging with a predefined list of specific tweets:
1. **Batch URL Input**: Accepts multiple URLs via newline or comma separation.
2. **Live URL Validation**: Instantly categorizes URLs into valid vs. invalid, displaying the status and count.
3. **Shared Reply Composition**: Single message sent to all valid posts.
4. **Preview & Confirmation**: Displays verified post URLs and handles before launching.

### 3.3. Recipient Safety Gate & "Others in Conversation" Disabler
Enforced universally across **both** Comment Replies (`replyToComment`) and Direct Post Replies (`processSinglePostReply`):
- **The Problem**: On X, replying to a comment or thread often automatically tags everyone previously mentioned in the thread ("Replying to @user1, @user2, and others...").
- **The Solution (`reply-recipients.ts`)**:
  1. Opens the "Replying to @..." header button inside the X composer.
  2. Detects the "Others in this conversation" toggle/checkbox.
  3. If enabled, clicks to uncheck it and pauses for visual confirmation.
  4. Scans listed recipients and unchecks any blacklisted handles or non-target users.
  5. Runs `canSubmitReply()` as a final gate. If the target recipient is missing or extra untargeted recipients are selected, automation **halts immediately** and captures an error screenshot.

### 3.4. Human-Like Behavior & Anti-Detection
- **Persistent Context**: Uses `chromium.launchPersistentContext` with user data stored outside installation folders.
- **Navigator Property Overrides**:
  - `navigator.webdriver` stripped (`undefined`).
  - `navigator.languages` set to `["en-US", "en"]`.
  - `navigator.plugins` mocked.
  - `window.chrome.runtime` stubbed.
- **Typing Jitter**: Keystrokes typed sequentially with randomized per-key delays (35ms – 75ms).
- **Post Delays**: Randomized pauses between posts (3.5s – 7.5s) to avoid bot-like cadence.
- **Rate Limit Handling**: Detects X rate-limit banners and toasts, triggering exponential backoff (e.g. 20s – 60s).

### 3.5. Jobs & Progress Dashboard (`/jobs`)
- Real-time queue monitor with automatic 2-second polling and IPC event push (`automation:status-change`).
- **Disk Persistence (`jobs.json`)**: All created jobs, item statuses, and timestamps are saved to disk (`%APPDATA%/X Engagement Assistant/jobs.json`), surviving app reboots and refreshes.
- Overall job status badges: `pending`, `running`, `completed`, `stopped`, `failed`.
- Detailed checklist of queue items showing:
  - Target URL & recipient username.
  - Item status: `pending`, `processing`, `success`, `failed`, `skipped`.
  - Error messages with debug screenshot links.
  - Execution timestamps (started at, completed at).
  - Progress bar with percentage completion.
- Controls:
  - **Stop Job**: Safely halts execution before the next item.
  - **Retry Job**: Resets failed and skipped items to `pending` and re-runs them with saved settings.

### 3.6. Interactive In-App Confirmation Modal (Safe Mode)
- **Component**: `ConfirmationModal` (`src/components/common/confirmation-modal.tsx`), mounted globally in the app layout.
- When `confirmationMode === "per-post"`, the automation engine pauses before each reply and broadcasts an `automation:confirm-request` IPC event.
- Displays a prominent review dialog detailing the recipient username, original comment, post link, and reply text.
- Provides one-click action buttons: **Confirm & Send**, **Skip Item**, or **Stop Queue**.

### 3.7. Persistent System Settings & Diagnostics Folders
- Configure conservative post limits, navigation timeouts, action timeouts, retry thresholds, and browser keep-alive toggles.
- Persisted to disk at `%APPDATA%/X Engagement Assistant/settings.json`.
- Wired directly into the automation processor (`JobProcessor`) and `XClient`.
- One-click explorer buttons to open local storage directories:
  - **Open Logs** (`%APPDATA%/logs`)
  - **Open Screenshots** (`%APPDATA%/screenshots`)
  - **Open Profile** (`%APPDATA%/browser-profile`)

### 3.8. Persistent Disk Logging with File Rotation
- Automated log rotation in `src/automation/logger.ts`.
- Logs append to `app.log` in `%APPDATA%/logs`.
- When `app.log` exceeds 5MB, it automatically archives up to 3 rotated copies (`app.1.log`, `app.2.log`, `app.3.log`).

### 3.9. Persistent X Browser Profile & One-Click Login
- **Launch & Sign In X**: Dedicated button in the top navigation bar and dashboard card.
- Opens the persistent Chromium browser directly to `https://x.com/i/flow/login`.
- Preserves cookies (`auth_token`, `twid`) across app reboots so the user only signs in once.
- Real-time network status indicator badge (`Online` / `No Internet Connection`).

### 3.10. Interactive CLI Fallback
For power users and headless server environments:
- `npm run cli`: Interactive console prompt for both Comment Discovery and Main Post workflows.
- `npm run cli:batch`: Automated batch execution from CLI arguments.

---

## 4. Directory & File Reference

```text
twitterbot/
├── electron/                         # Desktop Main Process & IPC Layer
│   ├── main.ts                       # App lifecycle, single-instance lock, window & Next.js server setup
│   ├── preload.ts                    # ContextBridge script exposing window.desktop API
│   ├── config/
│   │   └── runtime-config.ts         # Path resolution (%APPDATA%, userData, bundled Chromium paths)
│   ├── ipc/                          # IPC Request Handlers
│   │   ├── automation.ipc.ts         # Handlers for discoverComments, createReplyJob, stopJob, retryJob
│   │   ├── browser.ipc.ts            # Handlers for browser connect, launchX, disconnect, status
│   │   ├── settings.ipc.ts           # Handlers for getPaths
│   │   └── index.ts                  # Central registry for all IPC channels
│   └── services/                     # Core Main-Process Services
│       ├── automation-service.ts     # Orchestrates job processor, broadcasts progress & logs to window
│       ├── browser-service.ts        # Controls BrowserManager from Electron
│       └── settings-service.ts       # Exposes runtime storage paths
│
├── src/                              # Next.js Application Source
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout with header, navigation, and LaunchX button
│   │   ├── page.tsx                  # Primary workspace: New Job, Comment Discovery, Post Reply
│   │   ├── globals.css               # Global Tailwind CSS and glassmorphism styling
│   │   ├── jobs/page.tsx             # Jobs Dashboard & real-time execution checklist
│   │   ├── settings/page.tsx         # System settings UI (timeouts, limits, retries)
│   │   └── api/                      # Fallback API routes (for browser/standalone mode)
│   │       ├── browser/launch/       # GET/POST browser launch endpoint
│   │       ├── comments/discover/    # Comment discovery endpoint
│   │       ├── comments/reply/       # Comment reply job creation endpoint
│   │       └── jobs/                 # Job list, status, start, stop, retry endpoints
│   │
│   ├── automation/                   # Playwright Automation Engine
│   │   ├── browser/
│   │   │   ├── browser-manager.ts    # Singleton managing persistent BrowserContext & Page
│   │   │   ├── browser-path.ts       # Discovers bundled or system Chromium binary path
│   │   │   └── browser-profile.ts    # Computes user data, profile, and debug screenshot paths
│   │   ├── browser.ts                # Helper wrappers (getPersistentBrowserContext, auth check, screenshots)
│   │   ├── comments.ts               # Core comment discovery & extraction algorithms
│   │   ├── reply-recipients.ts       # Critical safety gate: recipient verification & checkbox toggling
│   │   ├── reply-to-comment.ts       # Comment reply flow (navigation, element match, recipient check, submit)
│   │   ├── reply-post.ts             # Direct post reply flow
│   │   ├── x-client.ts               # X navigation, authentication checks, typing jitter, submission
│   │   ├── x-selectors.ts            # Semantic data-testid and ARIA selector map for X
│   │   ├── logger.ts                 # Unified logging subsystem with event listeners
│   │   └── errors.ts                 # Standardized AutomationError exception types
│   │
│   ├── components/                   # Reusable React Components
│   │   ├── browser/launch-x-button.tsx # "Launch & Sign in X" button (header & card variants)
│   │   ├── comments/comment-card.tsx # Interactive card displaying discovered comments
│   │   └── common/network-status-badge.tsx # Real-time online/offline connection badge
│   │
│   ├── db/                           # Embedded SQLite Database Layer
│   │   ├── index.ts                  # DatabaseSync connection, WAL mode, legacy JSON auto-migration
│   │   ├── schema.ts                 # SQL DDL schemas for jobs, job_items, and settings tables & indexes
│   │   ├── jobs-repository.ts        # Typed repository for jobs, items, status mutators & cascading deletes
│   │   ├── settings-repository.ts    # Typed repository for system configuration parameters
│   │   └── sqlite.ts                 # Universal node:sqlite runtime loader (compatible with ESM & CommonJS)
│   │
│   ├── queue/                        # Sequential Job Queue Subsystem
│   │   ├── queue.ts                  # JobQueueManager (backed by SQLite JobsRepository)
│   │   └── processor.ts              # Sequential JobProcessor with retry loops & jitter delays
│   │
│   ├── types/                        # TypeScript Interface Definitions
│   │   ├── electron.d.ts             # Window.desktop API declarations & IPC payloads
│   │   ├── index.ts                  # AutomationJob, ReplyJobItem, Settings, CreateJobInput
│   │   └── x-comment.ts              # XComment, CommentDiscoverySettings, CommentDiscoveryResult
│   │
│   ├── utils/
│   │   └── url.ts                    # Strict URL validator and parser for x.com / twitter.com
│   │
│   ├── validation/
│   │   ├── comments.ts               # Zod schemas for comment discovery and reply inputs
│   │   └── index.ts                  # Zod schemas for createJob and automation settings
│   │
│   ├── cli.ts                        # Interactive Terminal CLI workflow
│   └── cli-batch.ts                  # Non-interactive CLI batch executor
│
├── scripts/                          # Build & Packaging Utilities
│   ├── build-electron.js             # Compiles Electron main & preload TypeScript via tsc
│   ├── dev.js                        # Launches Next.js dev server + compiles Electron + opens window
│   ├── package-chromium.js           # Copies Playwright's local Chromium build into build/chromium
│   ├── generate-icon.js              # Generates application icons from SVG
│   └── convert-icon.ps1              # Windows icon converter script
│
├── electron-builder.json             # Electron Builder packaging spec (NSIS for Win, DMG for Mac)
├── package.json                      # Scripts and dependencies
├── tsconfig.json                     # TypeScript config for Next.js app
├── tsconfig.electron.json            # TypeScript config for Electron main & preload
└── vitest.config.ts                  # Unit test configuration
```

---

## 5. Storage & File System Paths

All user data, browser sessions, and screenshots are stored strictly outside application code directories to ensure upgrades do not overwrite user data:

| Asset | Windows Path | macOS Path |
| :--- | :--- | :--- |
| **User Data Directory** | `%APPDATA%\X Engagement Assistant` | `~/Library/Application Support/X Engagement Assistant` |
| **Browser Profile & Cookies** | `%APPDATA%\X Engagement Assistant\browser-profile` | `~/Library/Application Support/X Engagement Assistant/browser-profile` |
| **Error Screenshots** | `%APPDATA%\X Engagement Assistant\screenshots` | `~/Library/Application Support/X Engagement Assistant/screenshots` |
| **Logs Directory** | `%APPDATA%\X Engagement Assistant\logs` | `~/Library/Application Support/X Engagement Assistant/logs` |

---

## 6. Development & Verification Guide

### 6.1. Running in Development
```bash
# Install dependencies
pnpm install

# Start Next.js + Electron in development mode
npm run dev
```

### 6.2. Running Unit Tests
```bash
# Execute Vitest test suites
pnpm test
```
The test suite covers:
- URL validation and parsing (`url.test.ts`)
- Queue creation and status updates (`queue.test.ts`)
- Comment data extraction logic (`comments.test.ts`)
- Recipient safety gate validation (`reply-recipients.test.ts`)
- Reply submission flow (`reply-to-comment.test.ts`)

### 6.3. Production Build & Packaging
```bash
# 1. Build Next.js and Electron TypeScript
npm run build

# 2. Package Playwright Chromium binary into build/chromium
npm run package:chromium

# 3. Create Windows NSIS installer
npm run dist:win

# Or macOS DMG installer
npm run dist:mac
```
Output files will be generated in `dist/`.
