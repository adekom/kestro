"use client";

import { useState } from "react";
import { addUserAction, updateUserAction } from "@/app/actions";
import type { AppUser, Role } from "@/lib/types";

export function UsersEditor({ users, currentEmail }: { users: AppUser[]; currentEmail: string }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState<string | null>(null);
  const run = async (p: ReturnType<typeof updateUserAction>) => {
    const res = await p;
    setError(res.ok ? null : res.error);
    return res.ok;
  };

  return (
    <section className="card">
      <div className="border-b border-border px-4 py-2.5">
        <h1 className="text-base font-semibold">Staff</h1>
        <p className="text-xs text-text-muted">
          Only listed, enabled people can sign in. They sign in with an email link sent to this address; Kestro sends no other email.
        </p>
      </div>
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-text-muted">
          <tr>
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
                {u.email}
                {u.email === currentEmail && <span className="ml-1 text-xs text-text-muted">(you)</span>}
              </td>
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
              <td className="px-4 py-2 text-text-muted">{u.lastSignInAt?.slice(0, 10) ?? "Never"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="flex items-end gap-2 border-t border-border p-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const res = await addUserAction(email, role);
          setError(res.ok ? null : res.error);
          if (res.ok) setEmail("");
        }}
      >
        <div className="flex-1">
          <label className="label" htmlFor="new-email">Add staff email</label>
          <input id="new-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="new-role">Role</label>
          <select id="new-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button className="btn btn-primary">Add</button>
      </form>
      {error && <p className="px-4 pb-4 text-sm text-danger" role="alert">{error}</p>}
    </section>
  );
}
