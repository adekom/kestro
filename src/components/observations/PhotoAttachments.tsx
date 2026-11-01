"use client";

import { useRef, useState } from "react";
import { Link2, PenLine, Trash2, X } from "lucide-react";
import { attachPhotoAction, deletePhotoAction, detachPhotoAction, getPhotoLibraryAction, shareLinkAction, updateCaptionAction } from "@/app/actions";
import { useAutosave } from "@/components/autosave";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { InlineText } from "@/components/ui/InlineEdit";
import { Modal } from "@/components/ui/Modal";
import { RowMenu } from "@/components/ui/RowMenu";
import { MarkupEditor } from "./MarkupEditor";
import { cropPosition } from "@/lib/markup";
import type { Photo, PhotoAttachment } from "@/lib/types";

/** Image for one use of a photo: marked-up when it has markup. The version keeps caches fresh. */
export const attachmentUrl = (pid: string, a: { id: string; markupVersion?: number }, v: "thumb" | "web" | "plain-web" | "original" = "thumb") =>
  `/api/projects/${pid}/attachments/${a.id}?v=${v}&m=${a.markupVersion ?? 0}`;

export const photoUrl = (pid: string, photoId: string, v: "thumb" | "web" | "original" = "thumb") =>
  `/api/projects/${pid}/photos/${photoId}?v=${v}`;

type Attachment = PhotoAttachment & { photo: Photo };

/**
 * Photos as compact rows: 50×50 thumbnail, caption, copy link, mark up,
 * remove, and a menu to delete the photo from the project. Captions, markup
 * and removal are available only for photos attached in report \`rid\`.
 */
export function PhotoRows({
  pid,
  rid,
  attachments,
  readOnly = false,
  onChanged,
  onError,
}: {
  pid: string;
  /** The report being worked in; null in read-only views. */
  rid: string | null;
  attachments: Attachment[];
  readOnly?: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  if (attachments.length === 0) return null;
  return (
    <ul className="divide-y divide-border">
      {attachments.map((a) => (
        <PhotoRow key={a.id} pid={pid} rid={rid} attachment={a} editable={!readOnly && a.reportId === rid} readOnly={readOnly} onChanged={onChanged} onError={onError} />
      ))}
    </ul>
  );
}

function PhotoRow({
  pid,
  rid,
  attachment: a,
  editable,
  readOnly,
  onChanged,
  onError,
}: {
  pid: string;
  rid: string | null;
  attachment: Attachment;
  editable: boolean;
  readOnly: boolean;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
  const [caption, setCaption] = useState(a.caption);
  const [copied, setCopied] = useState(false);
  const [marking, setMarking] = useState(false);
  const [confirm, setConfirm] = useState<"remove" | "delete" | null>(null);
  useAutosave(`caption-${a.id}`, caption, async (v) => {
    const res = await updateCaptionAction(pid, a.id, v);
    if (res.ok) onChanged();
    return res;
  });

  const icon = "rounded p-1.5 text-text-muted hover:bg-surface-muted hover:text-text disabled:invisible";
  return (
    <li className="flex items-center gap-2 py-1.5">
      <a
        href={attachmentUrl(pid, a, "web")}
        target="_blank"
        rel="noopener noreferrer"
        title="Open full image in a new tab"
        className="shrink-0 cursor-zoom-in rounded hover:ring-2 hover:ring-primary"
        onClick={(e) => {
          // Open explicitly so nothing in the panel can swallow the click.
          e.preventDefault();
          e.stopPropagation();
          window.open(attachmentUrl(pid, a, "web"), "_blank", "noopener");
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={attachmentUrl(pid, a)} alt={caption || a.photo.fileName} className="h-[50px] w-[50px] rounded object-cover" style={{ objectPosition: cropPosition(a.markup) }} loading="lazy" />
      </a>
      <div className="min-w-0 flex-1">
        {editable ? (
          <InlineText id={`cap-${a.id}`} ariaLabel="Caption" placeholder="Add caption" value={caption} onChange={setCaption} />
        ) : (
          <p className="field-inset truncate text-sm">{caption || <span className="text-text-muted">No caption</span>}</p>
        )}
      </div>
      <button
        type="button"
        className={icon}
        title={copied ? "Copied" : "Copy public link"}
        aria-label="Copy public link"
        onClick={async () => {
          const res = await shareLinkAction(pid, a.id);
          if (!res.ok) return onError(res.error);
          await navigator.clipboard.writeText(res.data).catch(() => window.prompt("Public link", res.data));
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <Link2 className={`h-4 w-4 ${copied ? "text-success" : ""}`} aria-hidden />
      </button>
      {!readOnly && (
        <>
          <button type="button" className={icon} disabled={!editable} title="Mark up" aria-label="Mark up photo" onClick={() => setMarking(true)}>
            <PenLine className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={icon} disabled={!editable} title="Remove from observation" aria-label="Remove photo from observation" onClick={() => setConfirm("remove")}>
            <X className="h-4 w-4" aria-hidden />
          </button>
          <span className={editable ? "" : "invisible"}>
            <RowMenu
              label="More photo actions"
              actions={[{ label: "Remove from report and delete from project photos", icon: Trash2, danger: true, onSelect: () => setConfirm("delete") }]}
            />
          </span>
        </>
      )}

      <ConfirmDialog
        open={confirm === "remove"}
        title="Remove photo from observation?"
        confirmLabel="Remove"
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const res = await detachPhotoAction(pid, rid ?? a.reportId, a.id);
          if (!res.ok) return res.error;
          onChanged();
          return null;
        }}
      >
        <p>The photo stays in Project Photos and can be attached again. Public links already shared keep working.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete photo from the project?"
        confirmLabel="Delete photo"
        danger
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          const res = await deletePhotoAction(pid, a.photoId);
          if (!res.ok) return res.error;
          onChanged();
          return null;
        }}
      >
        <p>
          <span className="font-medium">{a.photo.fileName}</span> will be removed from this report, from every other observation that uses
          it, and from Project Photos. Its public links will stop working. This can’t be undone.
        </p>
      </ConfirmDialog>

      <Modal open={marking} onClose={() => setMarking(false)} title={`Mark up ${a.photo.fileName}`} width="max-w-[95vw]" dismissible={false}>
        <MarkupEditor
          imageUrl={attachmentUrl(pid, a, "plain-web")}
          initial={a.markup?.shapes ?? []}
          initialCrop={a.markup?.crop ?? null}
          onCancel={() => setMarking(false)}
          onSave={async (shapes, crop, rendered) => {
            const form = new FormData();
            form.set("markup", JSON.stringify({ shapes, crop }));
            form.set("reportId", a.reportId);
            form.set("expectedVersion", String(a.markupVersion ?? 0));
            if (rendered) form.set("image", rendered, "markup.jpg");
            try {
              const res = await fetch(`/api/projects/${pid}/attachments/${a.id}/markup`, { method: "POST", body: form });
              const body = (await res.json().catch(() => ({}))) as { error?: string };
              if (!res.ok) return body.error ?? "The markup could not be saved.";
            } catch {
              return "The markup could not be saved. Check your connection and try again.";
            }
            setMarking(false);
            onChanged();
            return null;
          }}
        />
      </Modal>
    </li>
  );
}

/** Adds photos to an observation for report \`rid\`: drop/choose files, or reuse from the project library. */
export function PhotoUpload({
  pid,
  rid,
  observationId,
  attachedPhotoIds,
  onChanged,
  onError,
}: {
  pid: string;
  rid: string;
  observationId: string;
  attachedPhotoIds: Set<string>;
  onChanged: () => void;
  onError: (message: string | null) => void;
}) {
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
    form.set("observationId", observationId);
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

  return (
    <div>
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
        className={`rounded-md border-2 border-dashed p-4 text-center text-sm ${dragging ? "border-primary bg-primary-subtle" : "border-border text-text-muted"}`}
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
        <ul className="mt-3 grid max-h-72 grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 overflow-y-auto">
          {library.filter((p) => !attachedPhotoIds.has(p.id)).map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className="w-full rounded border border-border hover:ring-2 hover:ring-primary"
                title={p.fileName}
                onClick={async () => {
                  const res = await attachPhotoAction(pid, rid, observationId, p.id);
                  if (!res.ok) onError(res.error);
                  else onChanged();
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photoUrl(pid, p.id)} alt={p.fileName} className="aspect-square w-full rounded object-cover" loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
