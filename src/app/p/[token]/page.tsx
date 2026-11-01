import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveShare } from "@/server/services/photos";
import { Wordmark } from "@/components/Wordmark";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Photo", robots: { index: false, follow: false } };

/**
 * Public, read-only viewer for one shared photo. Shows only the requested
 * image and caption; never project records or other photos. A marked-up
 * photo shows its markup, with a toggle to see the original.
 */
export default async function PublicPhotoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { token } = await params;
  const { view } = await searchParams;
  const shared = await resolveShare(token);
  if (!shared) notFound();
  const hasMarkup = Boolean(shared.attachment.markupImages);
  const showOriginal = hasMarkup && view === "original";
  const src = `/api/public/${token}`;
  // The markup version keeps a browser from showing an outdated copy.
  const imageSrc = `${src}?${showOriginal ? "v=plain&" : ""}m=${shared.attachment.markupVersion ?? 0}`;
  return (
    <main className="flex min-h-screen flex-col items-center gap-4 p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageSrc} alt={shared.attachment.caption || "Shared photo"} className="max-h-[85vh] max-w-full rounded-md bg-surface shadow-sm" />
      {shared.attachment.caption && <p className="max-w-3xl text-center text-sm">{shared.attachment.caption}</p>}
      <div className="flex items-center gap-4 text-sm">
        {hasMarkup && (
          <Link className="link" href={showOriginal ? `/p/${token}` : `/p/${token}?view=original`}>
            {showOriginal ? "View markup" : "View original"}
          </Link>
        )}
        <a className="link" href={`${src}?v=original`}>Download original</a>
        <span className="text-text-muted">
          Shared with <Wordmark />
        </span>
      </div>
    </main>
  );
}
