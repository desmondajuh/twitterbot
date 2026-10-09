import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

function waitForServer(url, timeoutMs = 30000) {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      http
        .get(url, (res) => {
          if (res.statusCode && res.statusCode < 500) {
            resolve(true);
          } else {
            setTimeout(check, 500);
          }
        })
        .on("error", () => {
          if (Date.now() - startTime > timeoutMs) {
            resolve(false);
          } else {
            setTimeout(check, 500);
          }
        });
    };
    check();
  });
}

async function main() {
  console.log("🚀 Building Electron main & preload TypeScript...");
  const tscProcess = spawn("node", ["scripts/build-electron.js"], {
    stdio: "inherit",
    shell: true,
  });

  await new Promise((resolve) => tscProcess.on("exit", resolve));

  console.log("⚡ Starting Next.js development server...");
  const nextDevProcess = spawn("npx", ["next", "dev"], {
    stdio: "inherit",
    shell: true,
  });

  console.log("⏳ Waiting for http://localhost:3000...");
  const isReady = await waitForServer("http://localhost:3000");

  if (!isReady) {
    console.error("❌ Next.js dev server failed to respond in time.");
    nextDevProcess.kill();
    process.exit(1);
  }

  console.log("🖥️ Launching Electron desktop shell...");
  const electronProcess = spawn("npx", ["electron", "."], {
    stdio: "inherit",
    shell: true,
  });

  electronProcess.on("exit", () => {
    console.log("👋 Electron exited. Terminating Next.js server...");
    nextDevProcess.kill();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Error launching dev environment:", err);
  process.exit(1);
});
