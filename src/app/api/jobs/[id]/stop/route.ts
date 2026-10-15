import { NextResponse } from "next/server";
import { activeProcessors } from "../start/route";
import { jobQueue } from "@/queue/queue";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const processor = activeProcessors.get(id);

  if (processor) {
    processor.requestStop();
  }

  // Update job status immediately in the queue
  jobQueue.updateJobStatus(id, "stopped");
  return NextResponse.json({ message: "Job stopped successfully", jobId: id });
}
