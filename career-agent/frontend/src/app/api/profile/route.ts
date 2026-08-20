import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgentForUser } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const response = await callCareerAgentForUser("/api/profile", user);
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await requireAuthorizedUser(request);
    const response = await callCareerAgentForUser("/api/profile", user, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await request.json()),
    });
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}
