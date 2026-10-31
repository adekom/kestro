"use client";

import { useState } from "react";
import { createContactAction } from "@/app/actions";
import { contactName } from "@/lib/domain";
import type { Contact, ProjectContact } from "@/lib/types";
import { ContactForm } from "./ContactForm";

/**
 * Picks firm contacts (staff included) for a project, each with a role on the
 * project. If someone isn't in the list yet, they can be created here; new
 * contacts join the firm-wide list immediately.
 */
export function ContactPicker({
  contacts: initialContacts,
  excludeIds = [],
  selected,
  onChange,
}: {
  contacts: Contact[];
  excludeIds?: string[];
  selected: ProjectContact[];
  onChange: (next: ProjectContact[]) => void;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const chosen = new Set(selected.map((s) => s.contactId));
  const hidden = new Set(excludeIds);

  const q = query.trim().toLowerCase();
  const matches = contacts
    .filter((c) => !hidden.has(c.id) && !chosen.has(c.id))
    .filter((c) => !q || [contactName(c), c.email, c.company].some((f) => f.toLowerCase().includes(q)))
    .slice(0, 50);

  const add = (contactId: string) => onChange([...selected, { contactId, projectRole: "" }]);

  return (
    <div className="space-y-4">
      {selected.length > 0 && (
        <div>
          <h3 className="label">Selected ({selected.length})</h3>
          <ul className="divide-y divide-border rounded-md border border-border">
            {selected.map((s) => {
              const c = byId.get(s.contactId);
              return (
                <li key={s.contactId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{c ? contactName(c) : "Unknown contact"}</div>
                    <div className="truncate text-xs text-text-muted">{[c?.company, c?.email].filter(Boolean).join(" · ")}</div>
                  </div>
                  <label className="sr-only" htmlFor={`role-${s.contactId}`}>Role on project</label>
                  <input
                    id={`role-${s.contactId}`}
                    className="input w-48"
                    placeholder="Role on project"
                    value={s.projectRole}
                    onChange={(e) => onChange(selected.map((x) => (x.contactId === s.contactId ? { ...x, projectRole: e.target.value } : x)))}
                  />
                  <button type="button" className="link text-xs" onClick={() => onChange(selected.filter((x) => x.contactId !== s.contactId))}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {creating ? (
        <div className="rounded-md border border-border p-4">
          <h3 className="mb-3 text-sm font-semibold">New contact</h3>
          <ContactForm
            submitLabel="Create and select"
            onCancel={() => setCreating(false)}
            onUseExisting={(existing) => {
              if (!byId.has(existing.id)) setContacts([...contacts, existing]);
              if (!chosen.has(existing.id)) add(existing.id);
              setCreating(false);
            }}
            onSubmit={async (fields) => {
              const res = await createContactAction(fields);
              if (!res.ok) return res;
              setContacts([...contacts, res.data]);
              add(res.data.id);
              setCreating(false);
              return { ok: true };
            }}
          />
        </div>
      ) : (
        <div>
          <label className="label" htmlFor="contact-search">Add from firm contacts</label>
          <div className="flex gap-2">
            <input
              id="contact-search"
              className="input"
              placeholder="Search by name, email or company"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="button" className="btn shrink-0" onClick={() => setCreating(true)}>
              Create new contact
            </button>
          </div>
          <ul className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {matches.length === 0 ? (
              <li className="px-3 py-2 text-sm text-text-muted">
                No matching contacts.{" "}
                <button type="button" className="link" onClick={() => setCreating(true)}>Create a new contact</button>
              </li>
            ) : (
              matches.map((c) => (
                <li key={c.id}>
                  <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-surface-muted" onClick={() => add(c.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{contactName(c)}</span>
                      {c.userEmail && <span className="ml-2 rounded bg-primary-subtle px-1.5 py-0.5 text-xs text-primary-hover">staff</span>}
                      <span className="block truncate text-xs text-text-muted">{[c.company, c.email].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="text-xs text-primary">Add</span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
