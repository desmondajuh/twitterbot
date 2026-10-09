import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

console.log("🚀 Compiling Electron main and preload TypeScript...");
execSync("npx tsc -p tsconfig.electron.json", { stdio: "inherit" });

const distElectronDir = path.join(process.cwd(), "dist-electron");
if (!fs.existsSync(distElectronDir)) {
  fs.mkdirSync(distElectronDir, { recursive: true });
}

const pkgJsonPath = path.join(distElectronDir, "package.json");
fs.writeFileSync(
  pkgJsonPath,
  JSON.stringify({ type: "commonjs" }, null, 2),
  "utf8"
);

console.log("✅ Created dist-electron/package.json with type: commonjs");
