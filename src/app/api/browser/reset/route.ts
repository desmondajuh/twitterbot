import { NextResponse } from "next/server";
import { browserManager } from "@/automation/browser/browser-manager";

export async function POST() {
  try {
    const status = await browserManager.resetXSession();
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
