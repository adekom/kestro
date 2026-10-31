import { redirect } from "next/navigation";

/** A project opens on its Field Reports. */
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  redirect(`/projects/${(await params).projectId}/reports`);
}
