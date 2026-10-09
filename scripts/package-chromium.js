import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

/**
 * Script to prepare and verify Playwright Chromium binary for electron-builder packaging.
 */
function ensureChromiumDownloaded() {
  console.log("🔍 Checking Playwright Chromium installation...");
  try {
    execSync("npx playwright install chromium", { stdio: "inherit" });
    console.log("✅ Playwright Chromium binary is ready.");
  } catch (err) {
    console.warn("⚠️ Warning: Failed to run npx playwright install chromium:", err.message);
  }
}

function findPlaywrightChromiumDir() {
  const platform = process.platform;
  let baseMsPlaywrightDir = "";

  if (platform === "win32") {
    baseMsPlaywrightDir = path.join(process.env.LOCALAPPDATA || "", "ms-playwright");
  } else if (platform === "darwin") {
    baseMsPlaywrightDir = path.join(process.env.HOME || "", "Library", "Caches", "ms-playwright");
  } else {
    baseMsPlaywrightDir = path.join(process.env.HOME || "", ".cache", "ms-playwright");
  }

  if (!fs.existsSync(baseMsPlaywrightDir)) {
    return null;
  }

  const entries = fs.readdirSync(baseMsPlaywrightDir);
  const chromiumEntry = entries.find((e) => e.startsWith("chromium-"));

  if (chromiumEntry) {
    return path.join(baseMsPlaywrightDir, chromiumEntry);
  }

  return null;
}

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

function copyChromiumToResources() {
  ensureChromiumDownloaded();
  const sourceDir = findPlaywrightChromiumDir();

  if (!sourceDir) {
    console.warn("⚠️ Warning: Could not locate ms-playwright Chromium cache directory.");
    return;
  }

  const targetDir = path.resolve(process.cwd(), "build", "chromium");
  console.log(`📦 Bundling Playwright Chromium from ${sourceDir} to ${targetDir}...`);

  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }

  copyRecursiveSync(sourceDir, targetDir);
  console.log("✅ Playwright Chromium binary successfully bundled for desktop packaging.");
}

copyChromiumToResources();
