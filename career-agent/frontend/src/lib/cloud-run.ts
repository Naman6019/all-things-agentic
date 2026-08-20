import { GoogleAuth } from "google-auth-library";
import { talentOSUserId } from "@/lib/auth-server";

const googleAuth = new GoogleAuth();

export class UpstreamError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function callTalentOS(path: string, init: RequestInit = {}) {
  const baseUrl = (process.env.TALENTOS_API_URL || process.env.CAREER_AGENT_API_URL)?.replace(/\/$/, "");
  if (!baseUrl) {
    throw new UpstreamError("TALENTOS_API_URL is not configured.", 503);
  }

  const headers = new Headers(init.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(baseUrl)) {
    const client = await googleAuth.getIdTokenClient(baseUrl);
    const token = await client.idTokenProvider.fetchIdToken(baseUrl);
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `TalentOS returned ${response.status}.`;
    try {
      const body = (await response.json()) as { detail?: string };
      detail = body.detail || detail;
    } catch {
      // Keep the sanitized status message when upstream did not return JSON.
    }
    throw new UpstreamError(detail, response.status);
  }

  return response;
}

export async function callTalentOSForUser(
  path: string,
  user: { uid: string; email?: string | null },
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("x-talentos-user-id", talentOSUserId(user));
  return callTalentOS(path, { ...init, headers });
}

// Backwards-compatible alias
export const callCareerAgent = callTalentOS;
export const callCareerAgentForUser = callTalentOSForUser;
