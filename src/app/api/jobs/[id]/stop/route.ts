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
    return NextResponse.json({ message: "Stop signal sent to job processor", jobId: id });
  }

  // Fallback: update job status if processor reference lost
  jobQueue.updateJobStatus(id, "stopped");
  return NextResponse.json({ message: "Job status updated to stopped", jobId: id });
}
