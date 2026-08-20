import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgentForUser } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

/**
 * The latest pipeline run's ingestion, drop and cost accounting.
 *
 * The pipeline has always written this to Firestore (fetched, unseen,
 * relevant_after_prefilter, filtered_out by reason, cost_usd) — nothing
 * exposed it, so the product could never show the work it did.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const response = await callCareerAgentForUser("/api/run-summary", user);
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}
