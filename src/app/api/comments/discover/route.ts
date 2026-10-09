import { NextResponse } from "next/server";
import { DiscoverCommentsSchema } from "@/validation";
import { getPersistentBrowserContext } from "@/automation/browser";
import { discoverComments } from "@/automation/comments";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = DiscoverCommentsSchema.parse(body);

    const context = await getPersistentBrowserContext({ headless: false });
    const page = context.pages()[0] || (await context.newPage());

    const result = await discoverComments(page, validated.postUrl, {
      maxComments: validated.maxComments,
      maxScrolls: validated.maxScrolls,
      excludedUsernames: validated.excludedUsernames,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Comment discovery failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
