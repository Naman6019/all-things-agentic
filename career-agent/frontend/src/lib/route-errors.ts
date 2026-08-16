import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth-server";
import { UpstreamError } from "@/lib/cloud-run";

export function routeError(error: unknown) {
  if (error instanceof AuthError || error instanceof UpstreamError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error(error);
  return NextResponse.json({ error: "Unexpected server error." }, { status: 500 });
}
