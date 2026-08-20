import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgentForUser } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

// The dashboards move a card between the To Apply / Applied / Skipped tabs, so
// every one of these is a legitimate target — not just the two the agent
// writes itself. `drafted` stays accepted because the pipeline uses it.
const allowed = new Set(["matched", "drafted", "applied", "skipped"]);

async function updateStatus(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const body = (await request.json()) as { job_id?: string; status?: string };
    if (!body.job_id || !allowed.has(body.status ?? "")) {
      return NextResponse.json(
        { error: `status must be one of: ${[...allowed].join(", ")}.` },
        { status: 400 },
      );
    }
    const response = await callCareerAgentForUser("/api/applications/status", user, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}

export const POST = updateStatus;
// The career dashboard has always sent PUT here. Without this export Next
// answered every Mark Applied / Skip / Move to Inbox click with a 405.
export const PUT = updateStatus;
