"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  attachPhotoAction,
  detachPhotoAction,
  getPhotoLibraryAction,
  reorderAttachmentsAction,
  shareLinkAction,
  updateCaptionAction,
} from "@/app/actions";
import { useAutosave } from "@/components/autosave";
import { InlineText } from "@/components/ui/InlineEdit";
import type { ObservationInReport } from "@/server/services/reportView";
import type { Photo, PhotoAttachment } from "@/lib/types";

export const photoUrl = (pid: string, photoId: string, v: "thumb" | "web" | "original" = "thumb") =>
  `/api/projects/${pid}/photos/${photoId}?v=${v}`;

/** Photos on an observation, recorded against report `rid`. Calls `onChanged` after every change. */
export function PhotoAttachments({
  pid,
  rid,
  item,
  onChanged,
  onError,
}: {
  pid: string;
  rid: string;
  item: ObservationInReport;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const oid = item.observation.id;
  const [library, setLibrary] = useState<Photo[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  async function upload(files: File[]) {
    if (!files.length) return;
    setUploading(`Uploading ${files.length} image${files.length > 1 ? "s" : ""}…`);
    onError(null);
    const form = new FormData();
    form.set("reportId", rid);
    form.set("observationId", oid);
    files.forEach((f) => form.append("files", f));
    try {
      const res = await fetch(`/api/projects/${pid}/photos/upload`, { method: "POST", body: form });
      const body = (await res.json()) as { error?: string; results?: Array<{ ok: boolean; error?: string }> };
      const failures = body.results?.filter((r) => !r.ok).map((r) => r.error) ?? (body.error ? [body.error] : []);
      if (failures.length) onError(failures.join(" "));
    } catch {
      onError("Upload failed. Check your connection and try again.");
    }
    setUploading(null);
    onChanged();
  }

  const move = (index: number, delta: number) => {
    const ids = item.attachments.map((a) => a.id);
    [ids[index], ids[index + delta]] = [ids[index + delta], ids[index]];
    void reorderAttachmentsAction(pid, rid, ids).then(onChanged);
  };
  const attachedPhotoIds = new Set(item.attachments.map((a) => a.photoId));

  return (
    <section aria-labelledby="photos-heading">
      <h3 id="photos-heading" className="mb-2 text-sm font-semibold">Photos</h3>
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
        {item.attachments.map((a, i) => (
          <AttachmentCard
            key={a.id}
            pid={pid}
            attachment={a}
            first={i === 0}
            last={i === item.attachments.length - 1}
            onMove={(d) => move(i, d)}
            onDetach={async () => {
              const res = await detachPhotoAction(pid, rid, a.id);
              if (!res.ok) onError(res.error);
              else onChanged();
            }}
            onError={onError}
          />
        ))}
      </ul>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload([...e.dataTransfer.files]);
        }}
        className={`mt-3 rounded-md border-2 border-dashed p-4 text-center text-sm ${dragging ? "border-primary bg-primary-subtle" : "border-border text-text-muted"}`}
      >
        {uploading ?? (
          <>
            Drop JPEG or PNG photos here, or{" "}
            <button type="button" className="link" onClick={() => input.current?.click()}>choose files</button>
            {" · "}
            <button
              type="button"
              className="link"
              onClick={async () => {
                setPicking(!picking);
                if (!library) {
                  const res = await getPhotoLibraryAction(pid);
                  if (res.ok) setLibrary(res.data);
                  else onError(res.error);
                }
              }}
            >
              reuse from project library
            </button>
          </>
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png"
          multiple
          hidden
          onChange={(e) => {
            void upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {picking && !library && <p className="mt-2 text-sm text-text-muted">Loading photos…</p>}
      {picking && library && (
        <ul className="mt-3 grid max-h-72 grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 overflow-y-auto">
          {library.filter((p) => !attachedPhotoIds.has(p.id)).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full rounded border border-border hover:ring-2 hover:ring-primary"
                title={p.fileName}
                onClick={async () => {
                  const res = await attachPhotoAction(pid, rid, oid, p.id);
                  if (!res.ok) onError(res.error);
                  else onChanged();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(pid, p.id)} alt={p.fileName} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AttachmentCard({
  pid,
  attachment,
  first,
  last,
  onMove,
  onDetach,
  onError,
}: {
  pid: string;
  attachment: PhotoAttachment & { photo: Photo };
  first: boolean;
  last: boolean;
  onMove: (delta: number) => void;
  onDetach: () => void;
  onError: (message: string | null) => void;
}) {
  const [caption, setCaption] = useState(attachment.caption);
  const [copied, setCopied] = useState(false);
  useAutosave(`caption-${attachment.id}`, caption, (v) => updateCaptionAction(pid, attachment.id, v));

  return (
    <li className="rounded-md border border-border bg-surface">
      <a href={photoUrl(pid, attachment.photoId, "web")} target="_blank" rel="noopener" title="Open full image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl(pid, attachment.photoId)}
          alt={caption || attachment.photo.fileName}
          className="aspect-[4/3] w-full rounded-t-md object-cover"
          loading="lazy"
        />
      </a>
      <div className="space-y-1.5 p-2">
        <label className="sr-only" htmlFor={`cap-${attachment.id}`}>Caption</label>
        <InlineText id={`cap-${attachment.id}`} className="text-xs" placeholder="Add caption" value={caption} onChange={setCaption} />
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <button type="button" className="link disabled:invisible" disabled={first} onClick={() => onMove(-1)} aria-label="Move photo earlier"><ChevronLeft className="h-4 w-4" aria-hidden /></button>
          <button type="button" className="link disabled:invisible" disabled={last} onClick={() => onMove(1)} aria-label="Move photo later"><ChevronRight className="h-4 w-4" aria-hidden /></button>
          <a className="link" href={photoUrl(pid, attachment.photoId, "original")}>Original</a>
          <button
            type="button"
            className="link"
            onClick={async () => {
              const res = await shareLinkAction(pid, attachment.id);
              if (!res.ok) return onError(res.error);
              await navigator.clipboard.writeText(res.data).catch(() => window.prompt("Public link", res.data));
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <button type="button" className="link ml-auto" onClick={onDetach} title="Detach from this observation (the file stays in the project library)">
            Detach
          </button>
        </div>
      </div>
    </li>
  );
}
