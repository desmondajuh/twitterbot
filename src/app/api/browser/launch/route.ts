import { NextResponse } from "next/server";
import { browserManager } from "@/automation/browser/browser-manager";

export async function POST() {
  try {
    const status = await browserManager.launchX();
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
