import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgent } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

export async function GET(request: NextRequest) {
  try {
    await requireAuthorizedUser(request);
    const jobId = request.nextUrl.searchParams.get("job_id");
    if (!jobId) return NextResponse.json({ error: "job_id is required." }, { status: 400 });

    const response = await callCareerAgent(`/api/materials?job_id=${encodeURIComponent(jobId)}`);
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuthorizedUser(request);
    const body = await request.json();
    const response = await callCareerAgent("/api/materials", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}
