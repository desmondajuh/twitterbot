import { NextResponse } from "next/server";
import { jobQueue } from "@/queue/queue";
import { JobProcessor } from "@/queue/processor";
import { activeProcessors } from "../start/route";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = jobQueue.getJob(id);

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status === "running") {
    return NextResponse.json({ error: "Job is currently running" }, { status: 400 });
  }

  // Reset failed and skipped items back to pending state
  const resetJob = jobQueue.resetFailedItems(id);
  if (!resetJob) {
    return NextResponse.json({ error: "No items to retry" }, { status: 400 });
  }

  const processor = new JobProcessor();
  activeProcessors.set(id, processor);

  // Trigger execution asynchronously
  processor
    .processJob(id, {
      keepBrowserOpenOnFinish: false,
    })
    .finally(() => {
      activeProcessors.delete(id);
    });

  return NextResponse.json({
    message: "Retrying failed items",
    jobId: id,
    job: resetJob,
  });
}
