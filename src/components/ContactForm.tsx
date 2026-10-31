"use client";

import { useState } from "react";
import { contactName } from "@/lib/domain";
import type { Contact } from "@/lib/types";

export type ContactFields = Pick<Contact, "firstName" | "lastName" | "email" | "company" | "title" | "phone">;

export const EMPTY_CONTACT: ContactFields = { firstName: "", lastName: "", email: "", company: "", title: "", phone: "" };

type SubmitResult = { ok: true } | { ok: false; error: string; duplicateContact?: Contact };

/**
 * Fields for a firm contact. First name and email are required; when the
 * email already belongs to someone, the caller can offer that contact instead.
 */
export function ContactForm({
  initial = EMPTY_CONTACT,
  submitLabel,
  onSubmit,
  onCancel,
  onUseExisting,
  emailLocked = false,
  children,
}: {
  initial?: ContactFields;
  submitLabel: string;
  onSubmit: (fields: ContactFields) => Promise<SubmitResult>;
  onCancel?: () => void;
  /** Shown as an action when the email is already taken. */
  onUseExisting?: (existing: Contact) => void;
  emailLocked?: boolean;
  /** Extra fields rendered above the buttons (e.g. role on the project). */
  children?: React.ReactNode;
}) {
  const [fields, setFields] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Contact | null>(null);
  const [busy, setBusy] = useState(false);

  const field = (k: keyof ContactFields, label: string, opts: { type?: string; required?: boolean; autoComplete?: string } = {}) => (
    <div>
      <label className="label" htmlFor={`contact-${k}`}>
        {label}
        {opts.required && <span className="text-danger"> *</span>}
      </label>
      <input
        id={`contact-${k}`}
        className="input"
        type={opts.type ?? "text"}
        required={opts.required}
        autoComplete={opts.autoComplete}
        disabled={k === "email" && emailLocked}
        aria-invalid={k === "email" && duplicate ? true : undefined}
        value={fields[k]}
        onChange={(e) => {
          setFields({ ...fields, [k]: e.target.value });
          if (k === "email") setDuplicate(null);
        }}
      />
    </div>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const res = await onSubmit(fields);
        setBusy(false);
        if (res.ok) return;
        setError(res.error);
        setDuplicate(res.duplicateContact ?? null);
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {field("firstName", "First name", { required: true, autoComplete: "off" })}
        {field("lastName", "Last name", { autoComplete: "off" })}
        {field("email", "Email", { type: "email", required: true, autoComplete: "off" })}
        {field("phone", "Phone", { type: "tel", autoComplete: "off" })}
        {field("company", "Company")}
        {field("title", "Title")}
      </div>
      {emailLocked && <p className="text-xs text-text-muted">This person is a Kestro user; their email is managed under Kestro settings, Staff.</p>}
      {children}
      {error && (
        <div role="alert" className="rounded-md border border-danger bg-danger-subtle p-3 text-sm text-danger">
          {error}
          {duplicate && onUseExisting && (
            <div className="mt-2">
              <button type="button" className="btn" onClick={() => onUseExisting(duplicate)}>
                Use {contactName(duplicate) || duplicate.email}
              </button>
            </div>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}
