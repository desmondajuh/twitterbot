import { NextResponse } from "next/server";
import { z } from "zod";
import { ReplyCommentsSchema } from "@/validation";
import { jobQueue } from "@/queue/queue";
import { JobProcessor } from "@/queue/processor";
import { activeProcessors } from "@/app/api/jobs/[id]/start/route";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = ReplyCommentsSchema.parse(body);

    // Convert selected comments into job items
    const commentUrls = validated.comments.map((c) => {
      let url = c.url.trim();
      if (!url.startsWith("http")) {
        url = `https://x.com${url.startsWith("/") ? "" : "/"}${url}`;
      }
      return url;
    });

    const job = jobQueue.createJob({
      urls: commentUrls,
      reply: validated.reply,
      confirmationMode: validated.confirmationMode === "batch" ? "batch" : "per-post",
      type: "comment_reply",
      comments: validated.comments,
      excludedUsernames: validated.excludedUsernames || [],
    });

    const processor = new JobProcessor();
    activeProcessors.set(job.id, processor);

    // Trigger sequential processing asynchronously
    processor
      .processJob(job.id, {
        keepBrowserOpenOnFinish: false,
      })
      .finally(() => {
        activeProcessors.delete(job.id);
      });

    return NextResponse.json({
      message: "Comment reply automation job created and started",
      jobId: job.id,
      totalComments: validated.comments.length,
      job,
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      const msg = err.errors.map((e) => e.message).join(", ");
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const message = err instanceof Error ? err.message : "Failed to create comment reply job";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
