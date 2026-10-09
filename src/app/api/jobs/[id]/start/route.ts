import { NextResponse } from "next/server";
import { jobQueue } from "@/queue/queue";
import { JobProcessor } from "@/queue/processor";

const activeProcessors = new Map<string, JobProcessor>();

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
    return NextResponse.json({ error: "Job is already running" }, { status: 400 });
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

  return NextResponse.json({ message: "Job execution started", jobId: id });
}

export { activeProcessors };
