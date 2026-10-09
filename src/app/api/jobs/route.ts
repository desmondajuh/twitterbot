import { NextResponse } from "next/server";
import { jobQueue } from "@/queue/queue";
import { CreateJobSchema } from "@/validation";

export async function GET() {
  const jobs = jobQueue.getAllJobs();
  return NextResponse.json({ jobs });
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
