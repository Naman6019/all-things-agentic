"use client";

import { AuthProvider, useAuth } from "@/components/auth-provider";
import { AuthScreen } from "@/components/auth-screen";
import { FreelanceDashboard } from "@/components/freelance-dashboard";

function Product() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#f5f7f7]" aria-label="Loading TalentOS // Studio">
        <div className="flex items-center gap-3 text-sm font-medium text-[#53635e]">
          <span className="size-4 rounded-full border-2 border-[#b5c9c2] border-t-[#8b423a]" />
          Loading Studio…
        </div>
      </main>
    );
  }

  return user ? <FreelanceDashboard /> : <AuthScreen />;
}

export default function FreelancePage() {
  return <AuthProvider><Product /></AuthProvider>;
}