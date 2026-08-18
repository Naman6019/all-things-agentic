import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgent } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

export async function PUT(request: NextRequest) {
  try {
    await requireAuthorizedUser(request);
    const body = await request.formData();
    const leadId = String(body.get("lead_id") ?? "");
    const status = String(body.get("status") ?? "");
    if (!leadId || !status) {
      return NextResponse.json({ error: "lead_id and status are required." }, { status: 400 });
    }
    await callCareerAgent(`/api/leads/${leadId}/status?status=${encodeURIComponent(status)}`, { method: "PUT" });
    return NextResponse.json({ lead_id: leadId, status });
  } catch (error) {
    return routeError(error);
  }
}