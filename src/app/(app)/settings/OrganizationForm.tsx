"use client";

import { useState } from "react";
import { updateSettingsAction } from "@/app/actions";
import { SaveIndicator, SaveStatusProvider, useAutosave } from "@/components/autosave";
import type { FieldVisibility, OrgSettings } from "@/lib/types";
import { InlineText, InlineTextarea } from "@/components/ui/InlineEdit";

const VISIBILITY_LABELS: Record<keyof FieldVisibility, string> = {
  address: "Organization address",
  contact: "Organization contact line",
  attendance: "Attendance",
  ongoingWork: "Ongoing work",
  author: "Report author",
};

export function OrganizationForm({ settings }: { settings: OrgSettings }) {
  return (
    <SaveStatusProvider>
      <Form settings={settings} />
    </SaveStatusProvider>
  );
}

function Form({ settings }: { settings: OrgSettings }) {
  const [form, setForm] = useState({
    name: settings.name,
    address: settings.address,
    contactLine: settings.contactLine,
    disclaimer: settings.disclaimer,
    footerText: settings.footerText,
    showSummaryDefault: settings.showSummaryDefault,
    fieldVisibility: settings.fieldVisibility,
  });
  useAutosave("org", form, (v) => updateSettingsAction(v));
  const text = (k: "name" | "address" | "contactLine" | "footerText", label: string) => (
    <div>
      <label className="label" htmlFor={`org-${k}`}>{label}</label>
      <InlineText id={`org-${k}`} value={form[k]} onChange={(v) => setForm({ ...form, [k]: v })} />
    </div>
  );

  return (
    <section className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="field-inset text-base font-semibold">Organization and report branding</h2>
        <SaveIndicator />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {text("name", "Organization name")}
        {text("contactLine", "Contact line (phone, email, website)")}
        {text("address", "Address")}
        {text("footerText", "Page footer text")}
      </div>
      <div>
        <label className="label" htmlFor="org-disclaimer">Disclaimer (end of every report)</label>
        <InlineTextarea id="org-disclaimer" minHeight="min-h-24" value={form.disclaimer} onChange={(v) => setForm({ ...form, disclaimer: v })} />
      </div>
      <fieldset>
        <legend className="label">Show in PDF</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {(Object.keys(VISIBILITY_LABELS) as Array<keyof FieldVisibility>).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                className="accent-primary"
                checked={form.fieldVisibility[k]}
                onChange={(e) => setForm({ ...form, fieldVisibility: { ...form.fieldVisibility, [k]: e.target.checked } })}
              />
              {VISIBILITY_LABELS[k]}
            </label>
          ))}
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="accent-primary"
              checked={form.showSummaryDefault}
              onChange={(e) => setForm({ ...form, showSummaryDefault: e.target.checked })}
            />
            Observation summary (default)
          </label>
        </div>
      </fieldset>
    </section>
  );
}
