import { app, BrowserWindow } from "electron";
import path from "node:path";
import http from "node:http";
import { registerAllIpcHandlers } from "./ipc";
import { browserService } from "./services/browser-service";
import { RuntimeConfig } from "./config/runtime-config";
import { log } from "../src/automation/logger";

let mainWindow: BrowserWindow | null = null;
let nextServerProcess: any = null;

const GOT_SINGLE_INSTANCE_LOCK = app.requestSingleInstanceLock();

if (!GOT_SINGLE_INSTANCE_LOCK) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    registerAllIpcHandlers();
    await createMainWindow();
  });
}

async function waitForServer(url: string, timeoutMs: number = 20000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve(true);
          } else {
            reject(new Error(`Status ${res.statusCode}`));
          }
        });
        req.on("error", reject);
        req.end();
      });
      return true;
    } catch {
      await new Promise((res) => setTimeout(res, 300));
    }
  }
  return false;
}

async function createMainWindow() {
  const preloadPath = path.join(__dirname, "preload.js");

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "X Engagement Assistant",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  const isDev = RuntimeConfig.isDevelopment;
  const devUrl = process.env.ELECTRON_START_URL || "http://localhost:3000";

  if (isDev) {
    log(`Running in development mode. Waiting for Next.js dev server at ${devUrl}...`);
    const isServerReady = await waitForServer(devUrl);
    if (isServerReady) {
      await mainWindow.loadURL(devUrl);
    } else {
      log(`Failed to connect to dev server at ${devUrl}`, "error");
      await mainWindow.loadURL(devUrl);
    }
  } else {
    log("Running in packaged production mode.");
    const port = process.env.PORT || "3000";
    const prodUrl = `http://127.0.0.1:${port}`;
    const appPath = app.getAppPath();

    try {
      log(`Initializing Next.js production server from ${appPath}...`);
      const next = require("next");
      const nextApp = next({ dev: false, dir: appPath });
      await nextApp.prepare();
      const handle = nextApp.getRequestHandler();

      const server = http.createServer((req: any, res: any) => {
        handle(req, res);
      });

      await new Promise<void>((resolve, reject) => {
        server.listen(Number(port), "127.0.0.1", () => {
          log(`Next.js production server listening on ${prodUrl}`);
          resolve();
        });
        server.on("error", (err: any) => reject(err));
      });
    } catch (e) {
      log(`Failed to start Next.js production server: ${(e as Error).message}`, "error");
    }

    const isServerReady = await waitForServer(prodUrl);
    if (isServerReady) {
      await mainWindow.loadURL(prodUrl);
    } else {
      await mainWindow.loadURL(prodUrl);
    }
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (mainWindow === null) {
    await createMainWindow();
  }
});

app.on("before-quit", async (_event: any) => {
  log("Application shutting down, closing browser context cleanly...");
  try {
    await browserService.disconnect();
  } catch (err) {
    log(`Error closing browser on quit: ${(err as Error).message}`, "error");
  }

  if (nextServerProcess) {
    try {
      nextServerProcess.kill();
    } catch {}
  }
});
