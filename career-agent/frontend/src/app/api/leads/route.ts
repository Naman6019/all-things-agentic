import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgentForUser } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

const statuses = new Set(["matched", "sent", "replied", "skipped", "archived", "pitched"]);

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const requested = request.nextUrl.searchParams.get("status") ?? "matched";
    const status = statuses.has(requested) ? requested : "matched";
    const response = await callCareerAgentForUser(`/api/leads?status=${status}`, user);
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}
