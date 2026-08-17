import { AuthProvider } from "@/components/auth-provider";
import { MaterialEditorPage } from "@/components/material-editor";

export default async function MaterialsPage({
  searchParams,
}: {
  searchParams: Promise<{ job_id?: string; type?: string }>;
}) {
  const query = await searchParams;
  const materialType = query.type === "resume" ? "resume" : "cover-letter";

  return (
    <AuthProvider>
      <MaterialEditorPage jobId={query.job_id ?? ""} materialType={materialType} />
    </AuthProvider>
  );
}
