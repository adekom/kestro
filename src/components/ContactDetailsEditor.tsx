"use client";

import { useState } from "react";
import { updateContactAction } from "@/app/actions";
import { SaveIndicator, SaveStatusProvider, useAutosave } from "@/components/autosave";
import { InlineText } from "@/components/ui/InlineEdit";
import type { Contact } from "@/lib/types";

type Fields = Pick<Contact, "firstName" | "lastName" | "email" | "phone" | "company" | "title" | "defaultRole">;

/**
 * Click-to-edit contact details, saved automatically. A staff member's email
 * is their sign-in address, so it can't be changed here.
 */
export function ContactDetailsEditor({ contact, onSaved }: { contact: Contact; onSaved?: () => void }) {
  return (
    <SaveStatusProvider>
      <Editor contact={contact} onSaved={onSaved} />
    </SaveStatusProvider>
  );
}

function Editor({ contact, onSaved }: { contact: Contact; onSaved?: () => void }) {
  const [fields, setFields] = useState<Fields>({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    company: contact.company,
    title: contact.title,
    defaultRole: contact.defaultRole,
  });
  useAutosave(`contact-${contact.id}`, fields, async (v) => {
    const res = await updateContactAction(contact.id, v);
    if (res.ok) onSaved?.();
    return res;
  });
  const field = (k: keyof Fields, label: string, type: "text" | "email" | "tel" = "text") => (
    <div>
      <label className="label" htmlFor={`cd-${k}`}>{label}</label>
      <InlineText
        id={`cd-${k}`}
        type={type}
        value={fields[k]}
        disabled={k === "email" && Boolean(contact.userEmail)}
        onChange={(v) => setFields((f) => ({ ...f, [k]: v }))}
      />
    </div>
  );
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <SaveIndicator />
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {field("firstName", "First name")}
        {field("lastName", "Last name")}
        {field("email", "Email", "email")}
        {field("phone", "Phone", "tel")}
        {field("company", "Company")}
        {field("title", "Title")}
        {field("defaultRole", "Default role")}
      </div>
      {contact.userEmail && <p className="text-xs text-text-muted">This person is staff; their email is their sign-in address and can’t be changed here.</p>}
    </div>
  );
}
