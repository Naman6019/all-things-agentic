"use client";

import { AuthProvider, useAuth } from "@/components/auth-provider";
import { AuthScreen } from "@/components/auth-screen";
import { CareerDashboard } from "@/components/career-dashboard";
import { LoadingScreen } from "@/components/ui/loading-screen";

function Product() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen label="TalentOS // Careers — loading pipeline…" />;
  return user ? <CareerDashboard /> : <AuthScreen />;
}

export default function JobsPage() {
  return (
    <AuthProvider>
      <Product />
    </AuthProvider>
  );
}
