import { NextResponse } from "next/server";
import { jobQueue } from "@/queue/queue";
import { CreateJobSchema } from "@/validation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const jobs = jobQueue.getAllJobs();
  return NextResponse.json(
    { jobs },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const validated = CreateJobSchema.parse(body);

    const job = jobQueue.createJob(validated);

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      total: job.totalItems,
      job,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request data";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    jobQueue.clearAllJobs();
    return NextResponse.json({ success: true, message: "All jobs cleared" });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
