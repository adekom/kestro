"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addProjectContactsAction } from "@/app/actions";
import { ContactPicker } from "@/components/ContactPicker";
import type { Contact, ProjectContact } from "@/lib/types";

export function AddProjectContacts({ projectId, contacts, existingIds }: { projectId: string; contacts: Contact[]; existingIds: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ProjectContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const back = `/projects/${projectId}/contacts`;

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <ContactPicker contacts={contacts} excludeIds={existingIds} selected={selected} onChange={setSelected} />
      </section>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || selected.length === 0}
          onClick={async () => {
            setBusy(true);
            const res = await addProjectContactsAction(projectId, selected);
            setBusy(false);
            if (res.ok) router.push(back);
            else setError(res.error);
          }}
        >
          Add {selected.length || ""} to project
        </button>
        <button type="button" className="btn" onClick={() => router.push(back)}>Cancel</button>
      </div>
    </div>
  );
}
