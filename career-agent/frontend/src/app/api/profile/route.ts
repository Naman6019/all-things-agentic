import { NextRequest, NextResponse } from "next/server";
import { requireAuthorizedUser } from "@/lib/auth-server";
import { callCareerAgent } from "@/lib/cloud-run";
import { routeError } from "@/lib/route-errors";

export async function GET(request: NextRequest) {
  try {
    await requireAuthorizedUser(request);
    const response = await callCareerAgent("/api/profile");
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuthorizedUser(request);
    const response = await callCareerAgent("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await request.json()),
    });
    return NextResponse.json(await response.json());
  } catch (error) {
    return routeError(error);
  }
}
