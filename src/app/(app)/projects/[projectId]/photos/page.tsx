import { requirePageUser } from "@/server/auth";
import { photoRows } from "@/server/services/tables";
import { PhotosTable } from "./PhotosTable";

export default async function ProjectPhotosPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const [user, rows] = await Promise.all([requirePageUser(), photoRows(projectId)]);
  return (
    <main className="page">
      <h1 className="page-title">Project Photos</h1>
      <PhotosTable projectId={projectId} rows={rows} isAdmin={user.role === "admin"} />
    </main>
  );
}
