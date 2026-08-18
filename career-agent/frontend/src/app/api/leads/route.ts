import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgent } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

const statuses = new Set(["matched", "sent", "replied", "skipped", "archived", "pitched"]);

export async function GET(request: NextRequest) {
  try {
    await requireAuthorizedUser(request);
    const requested = request.nextUrl.searchParams.get("status") ?? "matched";
    const status = statuses.has(requested) ? requested : "matched";
    const response = await callCareerAgent(`/api/leads?status=${status}`);
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}