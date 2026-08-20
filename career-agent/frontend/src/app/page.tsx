"use client";

import { AuthProvider, useAuth } from "@/components/auth-provider";
import { AgentLauncher } from "@/components/agent-launcher";
import { LandingPage } from "@/components/landing-page";
import { LoadingScreen } from "@/components/ui/loading-screen";

function Product() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen label="TalentOS // Initializing workspace…" />;
  return user ? <AgentLauncher /> : <LandingPage />;
}

export default function Home() {
  return (
    <AuthProvider>
      <Product />
    </AuthProvider>
  );
}
