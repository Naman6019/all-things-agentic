"use client";

import { AuthProvider } from "@/components/auth-provider";
import { FreelanceSettingsPage } from "@/components/freelance-settings";

export default function Page() {
  return (
    <AuthProvider>
      <FreelanceSettingsPage />
    </AuthProvider>
  );
}