import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgent } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

export async function POST(request: NextRequest) {
  try {
    await requireAuthorizedUser(request);
    const body = (await request.json()) as { job_id?: string; status?: string };
    if (!body.job_id || !["applied", "drafted"].includes(body.status ?? "")) {
      return NextResponse.json({ error: "Invalid job status update." }, { status: 400 });
    }
    const response = await callCareerAgent("/api/applications/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}
