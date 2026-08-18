"use client";

import { AuthProvider } from "@/components/auth-provider";
import { SearchPreferencesPage } from "@/components/search-preferences";

export default function SettingsPage() {
  return (
    <AuthProvider>
      <SearchPreferencesPage />
    </AuthProvider>
  );
}
