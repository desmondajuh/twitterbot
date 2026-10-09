import { NextResponse } from "next/server";
import { browserManager } from "@/automation/browser/browser-manager";

export async function POST() {
  try {
    const page = await browserManager.getPage({ headless: false });
    const currentUrl = page.url();
    if (!currentUrl || currentUrl === "about:blank" || !currentUrl.includes("x.com")) {
      await page.goto("https://x.com/i/flow/login", { waitUntil: "domcontentloaded" }).catch(() => {});
    }
    await page.bringToFront().catch(() => {});
    const status = await browserManager.getStatus();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const status = await browserManager.getStatus();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
