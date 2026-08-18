import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgent } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

export async function GET(request: NextRequest) {
  try {
    await requireAuthorizedUser(request);
    const jobId = request.nextUrl.searchParams.get("job_id");
    if (!jobId) return NextResponse.json({ error: "job_id is required." }, { status: 400 });

    const response = await callCareerAgent(`/resume?job_id=${encodeURIComponent(jobId)}`, {
      headers: { accept: "text/html" },
    });
    return new NextResponse(await response.text(), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return routeError(error);
  }
}
