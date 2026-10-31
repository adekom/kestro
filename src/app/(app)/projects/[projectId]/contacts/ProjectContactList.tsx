"use client";

import Link from "next/link";
import { useState } from "react";
import { removeProjectContactAction, setProjectContactRoleAction } from "@/app/actions";
import { SaveIndicator, SaveStatusProvider, useAutosave } from "@/components/autosave";
import { contactName } from "@/lib/domain";
import type { Contact, ProjectContact } from "@/lib/types";

type Row = ProjectContact & { contact: Contact };

export function ProjectContactList({ projectId, rows }: { projectId: string; rows: Row[] }) {
  const [error, setError] = useState<string | null>(null);
  if (rows.length === 0) {
    return (
      <p className="card p-4 text-sm text-text-muted">
        No contacts yet. <Link className="link" href={`/projects/${projectId}/contacts/add`}>Add contacts</Link>
      </p>
    );
  }
  return (
    <SaveStatusProvider>
      <section className="card">
        <div className="flex justify-end px-4 pt-2"><SaveIndicator /></div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Role on project</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.contactId} className="border-t border-border">
                <td className="px-4 py-2">
                  <Link className="link font-medium" href={`/contacts/${r.contactId}`}>{contactName(r.contact)}</Link>
                  {r.contact.userEmail && <span className="ml-2 rounded bg-primary-subtle px-1.5 py-0.5 text-xs text-primary-hover">staff</span>}
                </td>
                <td className="px-4 py-2">{r.contact.company}</td>
                <td className="px-4 py-2 text-text-muted">{r.contact.email}</td>
                <td className="px-4 py-2"><RoleInput projectId={projectId} row={r} /></td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    className="link text-xs"
                    title="Remove from this project (stays in the firm contact list)"
                    onClick={async () => {
                      const res = await removeProjectContactAction(projectId, r.contactId);
                      setError(res.ok ? null : res.error);
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <p className="px-4 pb-3 text-sm text-danger" role="alert">{error}</p>}
      </section>
    </SaveStatusProvider>
  );
}

function RoleInput({ projectId, row }: { projectId: string; row: Row }) {
  const [role, setRole] = useState(row.projectRole);
  useAutosave(`role-${row.contactId}`, role, (v) => setProjectContactRoleAction(projectId, row.contactId, v));
  return (
    <input
      className="input"
      aria-label={`Role of ${contactName(row.contact)} on this project`}
      placeholder="e.g. Contractor"
      value={role}
      onChange={(e) => setRole(e.target.value)}
    />
  );
}
