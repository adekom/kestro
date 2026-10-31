"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addUserAction } from "@/app/actions";
import type { Role } from "@/lib/types";

export function AddStaffForm() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [role, setRole] = useState<Role>("editor");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof form, label: string, type = "text", required = false) => (
    <div>
      <label className="label" htmlFor={`staff-${k}`}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={`staff-${k}`}
        type={type}
        required={required}
        autoComplete="off"
        className="input"
        value={form[k]}
        onChange={(e) => setForm({ ...form, [k]: e.target.value })}
      />
    </div>
  );

  return (
    <form
      className="card space-y-4 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await addUserAction(form.email, role, { firstName: form.firstName, lastName: form.lastName });
        setBusy(false);
        if (res.ok) router.push("/settings/users");
        else setError(res.error);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {field("firstName", "First name", "text", true)}
        {field("lastName", "Last name")}
        <div className="col-span-2">{field("email", "Work email", "email", true)}</div>
        <div>
          <label className="label" htmlFor="staff-role">Role</label>
          <select id="staff-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>Add staff member</button>
        <button type="button" className="btn" onClick={() => router.push("/settings/users")}>Cancel</button>
      </div>
    </form>
  );
}
