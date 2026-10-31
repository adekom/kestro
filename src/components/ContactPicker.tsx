"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import { createContactAction } from "@/app/actions";
import { contactName } from "@/lib/domain";
import type { Contact, ProjectContact } from "@/lib/types";
import { ContactForm } from "./ContactForm";

/**
 * Picks firm contacts (staff included) for a project, each with a role on the
 * project. Rows never move when selected: selection shows as a checkmark and
 * highlight, and the role field occupies a column that is always reserved.
 * New contacts are created in a dialog and join the firm-wide list.
 */
export function ContactPicker({
  contacts: initialContacts,
  excludeIds = [],
  selected,
  onChange,
}: {
  contacts: Contact[];
  /** Contacts already on the project: left out of the list. */
  excludeIds?: string[];
  selected: ProjectContact[];
  onChange: (next: ProjectContact[]) => void;
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const roleById = new Map(selected.map((s) => [s.contactId, s.projectRole]));
  const onProject = new Set(excludeIds);

  const q = query.trim().toLowerCase();
  const shown = contacts.filter((c) => !onProject.has(c.id)).filter((c) => !q || [contactName(c), c.email, c.company].some((f) => f.toLowerCase().includes(q)));

  const toggle = (id: string) =>
    onChange(roleById.has(id) ? selected.filter((s) => s.contactId !== id) : [...selected, { contactId: id, projectRole: "" }]);
  const select = (id: string) => !roleById.has(id) && !onProject.has(id) && onChange([...selected, { contactId: id, projectRole: "" }]);
  const closeDialog = () => dialog.current?.close();

  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="label" htmlFor="contact-search">Search firm contacts</label>
          <input
            id="contact-search"
            className="input"
            placeholder="Name, email or company"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn shrink-0"
          onClick={() => {
            setDialogKey((k) => k + 1); // fresh, empty form each time
            dialog.current?.showModal();
          }}
        >
          Create new contact
        </button>
      </div>
      <p className="text-xs text-text-muted" aria-live="polite">{selected.length} selected</p>

      <ul className="h-80 divide-y divide-border overflow-y-auto rounded-md border border-border" aria-label="Firm contacts">
        {shown.length === 0 && (
          <li className="px-3 py-2 text-sm text-text-muted">No matching contacts that aren’t already on the project. Use “Create new contact” to add one.</li>
        )}
        {shown.map((c) => {
          const checked = roleById.has(c.id);
          return (
            <li key={c.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${checked ? "bg-primary-subtle" : ""}`}>
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(c.id)} />
                <span
                  aria-hidden
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                    checked ? "border-primary bg-primary text-white" : "border-border bg-surface"
                  }`}
                >
                  {checked && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{contactName(c)}</span>
                  {c.userEmail && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-text-muted">staff</span>}
                  <span className="block truncate text-xs text-text-muted">{[c.company, c.email].filter(Boolean).join(" · ")}</span>
                </span>
              </label>
              {/* Reserved column: holds the role field when selected, so rows never change shape. */}
              <div className="w-52 shrink-0">
                <input
                  className={`input ${checked ? "" : "invisible"}`}
                  aria-label={`Role of ${contactName(c)} on project`}
                  placeholder="Role on project (optional)"
                  tabIndex={checked ? 0 : -1}
                  value={roleById.get(c.id) ?? ""}
                  onChange={(e) =>
                    onChange(selected.map((s) => (s.contactId === c.id ? { ...s, projectRole: e.target.value } : s)))
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>

      <dialog
        ref={dialog}
        aria-labelledby="new-contact-title"
        className="m-auto w-full max-w-2xl rounded-lg border border-border bg-surface p-5 text-text shadow-xl backdrop:bg-black/30"
      >
        <h2 id="new-contact-title" className="mb-4 text-base font-semibold">New contact</h2>
        <ContactForm
          key={dialogKey}
          submitLabel="Create and select"
          onCancel={closeDialog}
          onUseExisting={(existing) => {
            if (!contacts.some((c) => c.id === existing.id)) setContacts([...contacts, existing]);
            select(existing.id);
            closeDialog();
          }}
          onSubmit={async (fields) => {
            const res = await createContactAction(fields);
            if (!res.ok) return res;
            setContacts([...contacts, res.data]);
            select(res.data.id);
            closeDialog();
            return { ok: true };
          }}
        />
      </dialog>
    </div>
  );
}
