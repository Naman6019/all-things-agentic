import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function requireAuthorizedUser(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new AuthError("Sign in is required.", 401);
  }

  let user;
  try {
    user = await adminAuth.verifyIdToken(header.slice(7), true);
  } catch {
    throw new AuthError("Your session is invalid or expired.", 401);
  }

  const allowed = new Set(
    (process.env.AUTHORIZED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  if (!user.email || !allowed.has(user.email.toLowerCase())) {
    throw new AuthError("This account has not been provisioned for the private beta.", 403);
  }

  return user;
}
