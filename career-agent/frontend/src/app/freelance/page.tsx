"use client";

import { AuthProvider, useAuth } from "@/components/auth-provider";
import { AuthScreen } from "@/components/auth-screen";
import { FreelanceDashboard } from "@/components/freelance-dashboard";
import { LoadingScreen } from "@/components/ui/loading-screen";

function Product() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen label="TalentOS // Studio — loading pipeline…" />;
  return user ? <FreelanceDashboard /> : <AuthScreen />;
}

export default function FreelancePage() {
  return (
    <AuthProvider>
      <Product />
    </AuthProvider>
  );
}
