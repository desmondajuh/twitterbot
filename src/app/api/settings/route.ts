import { NextResponse } from "next/server";
import { settingsRepository } from "@/db/settings-repository";

export async function GET() {
  try {
    const settings = settingsRepository.getSettings();
    return NextResponse.json({ settings });
  } catch (err) {
    console.warn("Failed reading settings API:", err);
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const updated = settingsRepository.updateSettings(body);
    return NextResponse.json({ success: true, settings: updated });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}
