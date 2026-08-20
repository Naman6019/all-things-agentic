import { NextRequest } from "next/server";
import { adminAuth } from "@/lib/firebase-admin";

type AuthenticatedUser = {
  uid: string;
  email?: string | null;
};

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
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "unknown";
    const message = error instanceof Error ? error.message : String(error);
    console.error("Firebase token verification failed:", code, message);
    throw new AuthError("Your session is invalid or expired.", 401);
  }

  const allowed = new Set(
    (process.env.AUTHORIZED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  // An empty list is the public-preview mode. Keep the variable as an
  // optional emergency allowlist for the owner, staging, or a rollback.
  if (allowed.size > 0 && (!user.email || !allowed.has(user.email.toLowerCase()))) {
    throw new AuthError("This account is not enabled for TalentOS.", 403);
  }

  return user;
}

export function talentOSUserId(user: AuthenticatedUser) {
  const ownerEmails = new Set(
    (process.env.TALENTOS_OWNER_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );

  // Preserve the existing owner documents while new public accounts get a
  // uid-scoped Firestore namespace.
  if (user.email && ownerEmails.has(user.email.toLowerCase())) return "owner";
  return user.uid;
}
