"use client";

import { AuthProvider, useAuth } from "@/components/auth-provider";
import { AuthScreen } from "@/components/auth-screen";
import { AgentLauncher } from "@/components/agent-launcher";

function Product() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f5f7f7]" aria-label="Loading TalentOS">
        <div className="flex items-center gap-3 text-sm font-medium text-[#53635e]">
          <span className="size-4 rounded-full border-2 border-[#b5c9c2] border-t-[#0f6b55]" />
          Opening your workspace…
        </div>
      </main>
    );
  }

  return user ? <AgentLauncher /> : <AuthScreen />;
}

export default function Home() {
  return <AuthProvider><Product /></AuthProvider>;
}