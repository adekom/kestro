"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createProjectAction } from "@/app/actions";

export function NewProjectForm() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", code: "", address: "", description: "", reportPrefix: "Field Report " });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  return (
    <form
      className="card space-y-3 p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await createProjectAction(form);
        setBusy(false);
        if (res.ok) router.push(`/projects/${res.data}`);
        else setError(res.error);
      }}
    >
      <h2 className="text-sm font-semibold">New project</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <label className="label" htmlFor="np-name">Name</label>
          <input id="np-name" className="input" required value={form.name} onChange={set("name")} />
        </div>
        <div>
          <label className="label" htmlFor="np-code">Project number (optional)</label>
          <input id="np-code" className="input" value={form.code} onChange={set("code")} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="np-address">Address</label>
          <input id="np-address" className="input" value={form.address} onChange={set("address")} />
        </div>
        <div>
          <label className="label" htmlFor="np-prefix">Report label prefix</label>
          <input id="np-prefix" className="input" value={form.reportPrefix} onChange={set("reportPrefix")} />
        </div>
      </div>
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <button className="btn btn-primary" disabled={busy}>Create project</button>
    </form>
  );
}
