"use client";

import { useState } from "react";
import { deleteContactAction, saveContactAction } from "@/app/actions";
import type { Contact } from "@/lib/types";

const EMPTY = { name: "", company: "", role: "", email: "", phone: "" };

export function ContactsEditor({ projectId, contacts }: { projectId: string; contacts: Contact[] }) {
  const [draft, setDraft] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="card" aria-labelledby="contacts-heading">
      <h2 id="contacts-heading" className="border-b border-border px-4 py-2.5 text-sm font-semibold">Contacts</h2>
      <ul>
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm">
            <div className="flex-1">
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-text-muted">{[c.company, c.role, c.email, c.phone].filter(Boolean).join(" · ")}</div>
            </div>
            <button className="link text-xs" onClick={() => deleteContactAction(projectId, c.id)}>Remove</button>
          </li>
        ))}
      </ul>
      <form
        className="grid grid-cols-2 gap-2 p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await saveContactAction(projectId, draft);
          if (res.ok) {
            setDraft(EMPTY);
            setError(null);
          } else setError(res.error);
        }}
      >
        {(Object.keys(EMPTY) as Array<keyof typeof EMPTY>).map((k) => (
          <div key={k}>
            <label className="label capitalize" htmlFor={`c-${k}`}>{k}</label>
            <input id={`c-${k}`} className="input" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
          </div>
        ))}
        <div className="col-span-2 flex items-center gap-3">
          <button className="btn">Add contact</button>
          {error && <span className="text-sm text-danger" role="alert">{error}</span>}
        </div>
      </form>
    </section>
  );
}
