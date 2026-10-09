# X Engagement Assistant — Standalone Desktop Application

A standalone cross-platform desktop application built with **Electron**, **Next.js 16 (App Router)**, **TypeScript**, and **Playwright** for controlled, educational X (Twitter) browser automation.

---

## 🏗️ Desktop Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                    Electron Desktop Shell                   │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                     Next.js UI                        │  │
│  │                                                       │  │
│  │  Dashboard • Post Selection • Comment Discovery        │  │
│  │  Reply Configuration • Recipient Verification          │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│                   Secure ContextBridge IPC                  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                 Electron Main Process                 │  │
│  │                                                       │  │
│  │  BrowserManager • AutomationService • SettingsService  │  │
│  └──────────────────────────┬────────────────────────────┘  │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                  Playwright Automation                │  │
│  │                                                       │  │
│  │  Bundled Chromium Binary                              │  │
│  │  Persistent Browser Profile (%APPDATA% / UserData)    │  │
│  └──────────────────────────┬────────────────────────────┘  │
└─────────────────────────────┼───────────────────────────────┘
                              │
                              ▼
                            X.com
```

### Key Highlights
- **No Dependencies Required for End-Users**: Users do NOT need Node.js, npm, Playwright, or Chromium installed on their machine. The application installer bundles everything required.
- **Secure Sandboxed IPC**: Renderers run with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. No raw Node.js APIs or Playwright instances are exposed to React.
- **Persistent X Session**: Login credentials and session cookies are preserved inside Electron's `app.getPath("userData")/browser-profile`.
- **Safety Gate Preserved**: Recipient target verification and automatic disabling of "Others in this conversation" are strictly enforced prior to reply submission.

---

## 📂 Project Structure

```text
twitterbot/
├── electron/                   # Electron Main Process & IPC Services
│   ├── main.ts                 # Main process entry, window management & server setup
│   ├── preload.ts              # Typed contextBridge IPC API
│   ├── ipc/                    # IPC Handlers (automation, browser, settings)
│   ├── services/               # Automation, Browser, and Settings Services
│   └── config/                 # Centralized runtime configuration
│
├── src/                        # Next.js Application Source
│   ├── app/                    # Next.js App Router pages and API routes
│   ├── automation/             # Playwright automation core
│   │   ├── browser/            # BrowserManager, browser-path, browser-profile
│   │   ├── comments.ts         # Comment discovery & extraction
│   │   ├── reply-recipients.ts # Recipient safety verification gate
│   │   └── reply-to-comment.ts # Reply automation handler
│   ├── queue/                  # Job queue and sequential processor
│   ├── types/                  # TypeScript definitions & desktop API types
│   └── validation/             # Zod schema definitions
│
├── scripts/
│   ├── dev.js                  # Concurrent dev server & Electron runner script
│   └── package-chromium.js     # Bundles Playwright Chromium binary for installer
│
├── electron-builder.json       # Desktop packaging & installer configuration
├── package.json
└── tsconfig.electron.json      # TypeScript config for Electron main & preload
```

---

## 🛠️ Development & Execution

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Run Development Server
Starts the Next.js dev server, compiles Electron TypeScript, and launches the Electron desktop shell:
```bash
npm run dev
```

### 3. Run Unit Tests
Verifies Playwright automation, URL parsers, queue processing, and recipient safety logic:
```bash
npm test
```

---

## 📦 Production Packaging & Distribution

### Packaging Workflow
```bash
# 1. Build Next.js & Electron TypeScript
npm run build

# 2. Bundle Playwright Chromium binary
npm run package:chromium

# 3. Create platform installer
npm run dist
```

### Platform Commands

#### Windows (`.exe` Installer)
Generates an NSIS setup executable in `dist/`:
```bash
npm run dist:win
```
Output: `dist/X Engagement Assistant Setup 0.1.0.exe`

#### macOS (`.dmg` Installer)
Generates a DMG package for Intel and Apple Silicon Macs in `dist/`:
```bash
npm run dist:mac
```
Output: `dist/X Engagement Assistant-0.1.0.dmg`

---

## 🔐 Session & Storage Paths

The app stores user data strictly outside application install directories:

| Platform | Profile Storage Path |
| :--- | :--- |
| **Windows** | `%APPDATA%\X Engagement Assistant\browser-profile` |
| **macOS** | `~/Library/Application Support/X Engagement Assistant/browser-profile` |
| **Logs** | `%APPDATA%\X Engagement Assistant\logs` |
| **Screenshots** | `%APPDATA%\X Engagement Assistant\screenshots` |

---

## 🔏 Code Signing & Notarization Requirements

### Windows
- **Code Signing**: To prevent Windows SmartScreen warnings, sign the executable using an EV or Standard Code Signing Certificate via `electron-builder` by setting `CSC_LINK` and `CSC_KEY_PASSWORD` in your environment.

### macOS
- **Code Signing**: Requires an Apple Developer ID Application certificate.
- **Notarization**: macOS Gatekeeper requires apps to be notarized using `xcrun notarytool`. Configure Apple ID credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`) in CI environments.

---

## 📝 Verification & Test Summary

- ✅ **TypeScript Compilation**: Compiled `tsconfig.electron.json` cleanly.
- ✅ **Unit Tests**: Passed all 13 vitest tests across 5 test suites.
- ✅ **Next.js Production Build**: `next build` created optimized static and dynamic routes.
- ✅ **Chromium Bundling**: `scripts/package-chromium.js` packaged Playwright Chromium (`chromium-1148`) into `build/chromium`.
- ✅ **Windows Package**: `electron-builder` generated `dist/X Engagement Assistant Setup 0.1.0.exe`.
#   t w i t t e r b o t  
 