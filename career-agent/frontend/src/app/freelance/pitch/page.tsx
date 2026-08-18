import { AuthProvider } from "@/components/auth-provider";
import { PitchEditorPage } from "@/components/pitch-editor";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ lead_id?: string }>;
}) {
  const query = await searchParams;
  return (
    <AuthProvider>
      <PitchEditorPage leadId={query.lead_id ?? ""} />
    </AuthProvider>
  );
}