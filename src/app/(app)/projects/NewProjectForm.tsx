"use client";

import { useState } from "react";
import { createProjectAction } from "@/app/actions";
import { ContactPicker } from "@/components/ContactPicker";
import type { Contact, ProjectContact } from "@/lib/types";

export function NewProjectForm({
  contacts,
  currentContactId,
  onCreated,
  onCancel,
}: {
  contacts: Contact[];
  currentContactId: string | null;
  onCreated: (projectId: string) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({ name: "", code: "", address: "", description: "", reportPrefix: "Field Report " });
  // The person creating the project usually works on it, so start with them selected.
  const [selected, setSelected] = useState<ProjectContact[]>(currentContactId ? [{ contactId: currentContactId, projectRole: "" }] : []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof form, label: string, required = false) => (
    <div>
      <label className="label" htmlFor={`np-${k}`}>
        {label}
        {required && <span className="text-danger"> *</span>}
      </label>
      <input id={`np-${k}`} className="input" required={required} value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
    </div>
  );

  async function create() {
    if (!form.name.trim()) return setError("Project name is required.");
    setBusy(true);
    const res = await createProjectAction(form, selected);
    setBusy(false);
    if (res.ok) onCreated(res.data);
    else setError(res.error);
  }

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="field-inset text-sm font-semibold">Details</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">{field("name", "Name", true)}</div>
          {field("code", "Project number")}
          <div className="col-span-2">{field("address", "Address")}</div>
          {field("reportPrefix", "Report label prefix")}
        </div>
        <div>
          <label className="label" htmlFor="np-description">Description</label>
          <textarea id="np-description" className="input min-h-20" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="field-inset text-sm font-semibold">Contacts</h3>
          <p className="field-inset text-xs text-text-muted">Choose people from Members, including staff. New contacts are added to the firm list.</p>
        </div>
        <ContactPicker contacts={contacts} selected={selected} onChange={setSelected} />
      </section>

      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>Create project</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
