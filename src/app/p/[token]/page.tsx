import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveShare } from "@/server/services/photos";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Photo", robots: { index: false, follow: false } };

/**
 * Public, read-only viewer for one shared photo. Shows only the requested
 * image and caption; never project records or other photos.
 */
export default async function PublicPhotoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await resolveShare(token);
  if (!shared) notFound();
  const src = `/api/public/${token}`;
  return (
    <main className="flex min-h-screen flex-col items-center gap-4 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={shared.attachment.caption || "Shared photo"} className="max-h-[85vh] max-w-full rounded-md bg-surface shadow-sm" />
      {shared.attachment.caption && <p className="max-w-3xl text-center text-sm">{shared.attachment.caption}</p>}
      <div className="flex items-center gap-4 text-sm">
        <a className="link" href={`${src}?v=original`}>Download original</a>
        <span className="text-text-muted">
          Shared with <Wordmark />
        </span>
      </div>
    </main>
  );
}
