"use client";

import { useState } from "react";
import type { Photo } from "@/lib/types";
import { photoUrl } from "./PhotoAttachments";

/** Project-wide photo library: every upload lands here automatically. */
export function LibraryPanel({ projectId, library }: { projectId: string; library: Photo[] }) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const shown = library.filter((p) => {
    const day = p.createdAt.slice(0, 10);
    return (
      (!name || p.fileName.toLowerCase().includes(name.toLowerCase())) && (!from || day >= from) && (!to || day <= to)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-base font-semibold">Project photos ({library.length})</h2>
        <div>
          <label className="label" htmlFor="lib-name">File name</label>
          <input id="lib-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="lib-from">Uploaded from</label>
          <input id="lib-from" type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="lib-to">to</label>
          <input id="lib-to" type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-text-muted">No photos. Upload photos from an observation; they are added here automatically.</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
          {shown.map((p) => (
            <li key={p.id} className="card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photoUrl(projectId, p.id)} alt={p.fileName} className="aspect-[4/3] w-full object-cover" loading="lazy" />
              <div className="p-2 text-xs">
                <div className="truncate" title={p.fileName}>{p.fileName}</div>
                <div className="flex justify-between text-text-muted">
                  <span>{p.createdAt.slice(0, 10)}</span>
                  <a className="link" href={photoUrl(projectId, p.id, "original")}>Download</a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
