import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgentForUser } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

const allowed = new Set(["matched", "pitched", "sent", "replied", "skipped", "archived"]);

/**
 * Accepts JSON as well as form data.
 *
 * The Studio dashboard has always sent `application/json` here while this
 * handler only ever called `request.formData()` — which throws on a JSON body,
 * so every Mark Sent / Skip / Move to Inbox click failed with a 500.
 */
async function readBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { lead_id?: string; status?: string };
    return { leadId: body.lead_id ?? "", status: body.status ?? "" };
  }
  const form = await request.formData();
  return {
    leadId: String(form.get("lead_id") ?? ""),
    status: String(form.get("status") ?? ""),
  };
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const { leadId, status } = await readBody(request);
    if (!leadId || !allowed.has(status)) {
      return NextResponse.json(
        { error: `lead_id is required and status must be one of: ${[...allowed].join(", ")}.` },
        { status: 400 },
      );
    }
    await callCareerAgentForUser(`/api/leads/${leadId}/status?status=${encodeURIComponent(status)}`, user, {
      method: "PUT",
    });
    return NextResponse.json({ lead_id: leadId, status });
  } catch (error) {
    return routeError(error);
  }
}
