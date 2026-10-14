import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { getStorageDirectories } from "@/automation/browser/browser-profile";
import { AutomationSettings } from "@/types";

const DEFAULT_SETTINGS: AutomationSettings = {
  maxPostsPerJob: 20,
  confirmationMode: "per-post",
  navigationTimeoutMs: 30000,
  actionTimeoutMs: 10000,
  maxRetries: 2,
  keepBrowserOpenOnFinish: false,
};

function getSettingsPath(): string {
  const { userDataDir } = getStorageDirectories();
  return path.join(userDataDir, "settings.json");
}

export async function GET() {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const settings = JSON.parse(raw);
      return NextResponse.json({ settings: { ...DEFAULT_SETTINGS, ...settings } });
    }
  } catch (err) {
    console.warn("Failed reading settings API:", err);
  }
  return NextResponse.json({ settings: DEFAULT_SETTINGS });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filePath = getSettingsPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let existing = DEFAULT_SETTINGS;
    if (fs.existsSync(filePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } catch {}
    }

    const updated = { ...existing, ...body };
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2), "utf-8");

    return NextResponse.json({ success: true, settings: updated });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
