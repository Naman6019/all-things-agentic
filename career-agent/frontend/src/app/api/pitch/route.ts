import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgentForUser } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const leadId = request.nextUrl.searchParams.get("lead_id");
    if (!leadId) {
      return NextResponse.json({ error: "lead_id is required." }, { status: 400 });
    }
    const response = await callCareerAgentForUser(`/api/leads/${leadId}`, user);
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const body = await request.json();
    const leadId = body.lead_id;
    if (!leadId) {
      return NextResponse.json({ error: "lead_id is required." }, { status: 400 });
    }
    const payload: Record<string, unknown> = { lead_id: leadId };
    if (body.reset) {
      payload.reset = true;
    } else if (body.pitch_message) {
      payload.pitch_message = body.pitch_message;
    } else {
      return NextResponse.json({ error: "pitch_message or reset is required." }, { status: 400 });
    }
    const response = await callCareerAgentForUser(`/api/pitch`, user, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}
