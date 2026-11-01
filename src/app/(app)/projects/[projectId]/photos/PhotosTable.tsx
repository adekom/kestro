"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download, ExternalLink, FileText, Link2, Link2Off } from "lucide-react";
import { revokeShareAction, shareLinkAction } from "@/app/actions";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SlideOver } from "@/components/ui/SlideOver";
import { photoUrl } from "@/components/observations/PhotoAttachments";
import { formatLongDate } from "@/lib/domain";
import type { PhotoRow, PhotoUse } from "@/server/services/tables";

const sizeLabel = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const uploaded = (r: PhotoRow) => r.photo.createdAt.slice(0, 10);
const activeUses = (r: PhotoRow) => r.uses.filter((u) => !u.detached);

/**
 * Every photo uploaded to the project. Photos are added from observations
 * (they join this library automatically); here they can be found, viewed,
 * downloaded, and their public links managed.
 */
export function PhotosTable({ projectId, rows, isAdmin }: { projectId: string; rows: PhotoRow[]; isAdmin: boolean }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.photo.id === openId) ?? null;

  const columns: Column<PhotoRow>[] = [
    {
      id: "thumb",
      header: "Photo",
      weight: 0.8,
      cell: (r) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl(projectId, r.photo.id)} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />
      ),
    },
    { id: "name", header: "File name", weight: 2.5, cell: (r) => r.photo.fileName, sortValue: (r) => r.photo.fileName },
    { id: "uploaded", header: "Uploaded", weight: 1.4, cell: (r) => formatLongDate(uploaded(r)), sortValue: (r) => r.photo.createdAt },
    {
      id: "used",
      header: "Used in",
      weight: 2,
      cell: (r) => activeUses(r).map((u) => u.number).join(", ") || <span className="text-text-muted">Not attached</span>,
      sortValue: (r) => activeUses(r).map((u) => u.number).join(", "),
    },
    { id: "size", header: "Size", weight: 0.8, cell: (r) => sizeLabel(r.photo.sizeBytes), sortValue: (r) => r.photo.sizeBytes },
  ];

  return (
    <>
      <DataTable
        storageKey="project-photos"
        rows={rows}
        columns={columns}
        rowId={(r) => r.photo.id}
        selectable={false}
        // File name, upload date (e.g. "2026-07" or "July 14") and where it's used.
        filterText={(r) => `${r.photo.fileName} ${uploaded(r)} ${formatLongDate(uploaded(r))} ${r.uses.map((u) => `${u.number} ${u.title} ${u.caption}`).join(" ")}`}
        filterPlaceholder="Filter by file name or date"
        onRowClick={(r) => setOpenId((id) => (id === r.photo.id ? null : r.photo.id))}
        activeRowId={openId}
        initialSort={{ id: "uploaded", dir: "desc" }}
        emptyMessage="No photos yet. Photos added to observations appear here."
        rowActions={(r) => [
          { label: "Open full image", icon: ExternalLink, onSelect: () => window.open(photoUrl(projectId, r.photo.id, "web"), "_blank", "noopener") },
          { label: "Download original", icon: Download, onSelect: () => window.location.assign(photoUrl(projectId, r.photo.id, "original")) },
        ]}
      />
      <SlideOver open={Boolean(open)} onClose={() => setOpenId(null)} title={open?.photo.fileName ?? "Photo"}>
        {open && <PhotoDetails key={open.photo.id} projectId={projectId} row={open} isAdmin={isAdmin} onChanged={() => router.refresh()} />}
      </SlideOver>
    </>
  );
}

function PhotoDetails({ projectId, row, isAdmin, onChanged }: { projectId: string; row: PhotoRow; isAdmin: boolean; onChanged: () => void }) {
  const { photo, uses } = row;
  const [revoking, setRevoking] = useState<PhotoUse | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reportLink = (p: PhotoRow["mostRecent"]) => (p ? `/projects/${projectId}/reports/${p.reportId}?obs=${p.observationId}` : null);
  return (
    <div className="space-y-6">
      {(row.mostRecent || row.firstAdded) && (
        <div className="flex flex-wrap justify-end gap-2">
          {row.mostRecent && (
            <Link className="btn" href={reportLink(row.mostRecent)!}>
              <FileText className="h-4 w-4" aria-hidden /> Go to most recent report that contains this photo
            </Link>
          )}
          {row.firstAdded && (
            <Link className="btn" href={reportLink(row.firstAdded)!}>
              <FileText className="h-4 w-4" aria-hidden /> Go to report where this photo was first added
            </Link>
          )}
        </div>
      )}
      <a href={photoUrl(projectId, photo.id, "web")} target="_blank" rel="noopener" title="Open full image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photoUrl(projectId, photo.id, "web")} alt={photo.fileName} className="aspect-square w-full rounded-md object-cover" />
      </a>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 pt-3 text-sm">
        <div>
          <dt className="label">Uploaded</dt>
          <dd className="field-inset">{formatLongDate(photo.createdAt.slice(0, 10))}</dd>
        </div>
        <div>
          <dt className="label">Size</dt>
          <dd className="field-inset">{photo.width} × {photo.height}, {sizeLabel(photo.sizeBytes)}</dd>
        </div>
      </dl>
      <a className="btn" href={photoUrl(projectId, photo.id, "original")}>
        <Download className="h-4 w-4" aria-hidden /> Download original
      </a>

      <section className="space-y-2">
        <h3 className="field-inset text-sm font-semibold">Used in</h3>
        {uses.length === 0 && <p className="field-inset text-sm text-text-muted">Not attached to any observation.</p>}
        <ul className="divide-y divide-border">
          {uses.map((u) => (
            <li key={u.attachmentId} className="field-inset space-y-1 py-3 text-sm">
              <div>
                <span className="font-medium">{u.number}</span> {u.title}
                {u.detached && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-text-muted">detached</span>}
              </div>
              {u.caption && <div className="text-xs text-text-muted">“{u.caption}”</div>}
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="btn"
                  onClick={async () => {
                    const res = await shareLinkAction(projectId, u.attachmentId);
                    if (!res.ok) return setError(res.error);
                    await navigator.clipboard.writeText(res.data).catch(() => window.prompt("Public link", res.data));
                    setCopied(u.attachmentId);
                    setTimeout(() => setCopied(null), 2000);
                    if (!u.shared) onChanged();
                  }}
                >
                  <Link2 className="h-4 w-4" aria-hidden /> {copied === u.attachmentId ? "Copied" : "Copy public link"}
                </button>
                {isAdmin && u.shared && (
                  <button type="button" className="btn btn-danger" onClick={() => setRevoking(u)}>
                    <Link2Off className="h-4 w-4" aria-hidden /> Revoke public link
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}

      <ConfirmDialog
        open={Boolean(revoking)}
        title="Revoke public link?"
        confirmLabel="Revoke link"
        danger
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          const res = await revokeShareAction(projectId, revoking!.attachmentId);
          if (!res.ok) return res.error;
          onChanged();
          return null;
        }}
      >
        <p>
          The current public link to this photo will stop working everywhere, including in PDFs that were already sent. A new link
          is created the next time a PDF is exported or a link is copied.
        </p>
      </ConfirmDialog>
    </div>
  );
}
