"use client";

import Link from "next/link";
import { useState } from "react";
import { updateUserAction } from "@/app/actions";
import { contactName, formatLongDate } from "@/lib/domain";
import type { AppUser, Contact, Role } from "@/lib/types";

export function UsersEditor({ users, currentEmail }: { users: Array<AppUser & { contact: Contact | null }>; currentEmail: string }) {
  const [error, setError] = useState<string | null>(null);
  const run = async (p: ReturnType<typeof updateUserAction>) => {
    const res = await p;
    setError(res.ok ? null : res.error);
  };

  return (
    <section className="card">
      <div className="flex items-start gap-4 border-b border-border px-4 py-2.5">
        <div className="mr-auto">
          <h1 className="text-base font-semibold">Staff</h1>
          <p className="text-xs text-text-muted">
            Only listed, enabled people can sign in. They sign in with an email link sent to this address; Kestro sends no other email.
          </p>
        </div>
        <Link className="btn btn-primary shrink-0" href="/settings/users/new">Add staff member</Link>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">Name</th>
            <th className="px-4 py-2 font-medium">Email</th>
            <th className="px-4 py-2 font-medium">Role</th>
            <th className="px-4 py-2 font-medium">Access</th>
            <th className="px-4 py-2 font-medium">Last sign-in</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.email} className="border-t border-border">
              <td className="px-4 py-2">
                {u.contact ? (
                  <Link className="link" href={`/contacts/${u.contact.id}`}>{contactName(u.contact)}</Link>
                ) : (
                  <span className="text-text-muted">Not set</span>
                )}
                {u.email === currentEmail && <span className="ml-1 text-xs text-text-muted">(you)</span>}
              </td>
              <td className="px-4 py-2">{u.email}</td>
              <td className="px-4 py-2">
                <select
                  className="input w-28"
                  aria-label={`Role for ${u.email}`}
                  value={u.role}
                  onChange={(e) => run(updateUserAction(u.email, { role: e.target.value as Role }))}
                >
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
              </td>
              <td className="px-4 py-2">
                <button type="button" className={`btn ${u.enabled ? "" : "btn-primary"}`} onClick={() => run(updateUserAction(u.email, { enabled: !u.enabled }))}>
                  {u.enabled ? "Disable" : "Enable"}
                </button>
              </td>
              <td className="px-4 py-2 text-text-muted">{u.lastSignInAt ? formatLongDate(u.lastSignInAt.slice(0, 10)) : "Never"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="px-4 py-3 text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
