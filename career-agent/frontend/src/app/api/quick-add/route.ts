import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callTalentOSForUser } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const body = (await request.json()) as Record<string, unknown>;
    const runToken = process.env.TALENTOS_RUN_TOKEN || process.env.CAREER_AGENT_RUN_TOKEN;
    const response = await callTalentOSForUser("/api/quick-add", user, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(runToken ? { "x-run-token": runToken } : {}),
      },
      body: JSON.stringify(body),
    });
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}
