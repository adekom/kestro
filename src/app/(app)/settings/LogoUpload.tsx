"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoUpload({ hasLogo }: { hasLogo: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [stamp, setStamp] = useState(0);

  return (
    <section className="card space-y-3 p-4">
      <h2 className="field-inset text-sm font-semibold">Report header logo</h2>
      {hasLogo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/settings/logo?t=${stamp}`} alt="Current logo" className="max-h-16 max-w-xs" />
      )}
      <div className="flex items-center gap-3">
        <input
          type="file"
          accept="image/jpeg,image/png"
          aria-label="Upload logo"
          className="text-sm"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const form = new FormData();
            form.set("file", file);
            const res = await fetch("/api/settings/logo", { method: "POST", body: form });
            const body = (await res.json()) as { error?: string };
            setError(res.ok ? null : (body.error ?? "Upload failed."));
            setStamp(Date.now());
            router.refresh();
          }}
        />
        {hasLogo && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await fetch("/api/settings/logo", { method: "DELETE" });
              router.refresh();
            }}
          >
            Remove logo
          </button>
        )}
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
