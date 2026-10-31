"use client";

import { useRouter } from "next/navigation";
import { updateContactAction } from "@/app/actions";
import { ContactForm } from "@/components/ContactForm";
import type { Contact } from "@/lib/types";

export function EditContactForm({ contact }: { contact: Contact }) {
  const router = useRouter();
  return (
    <ContactForm
      initial={contact}
      emailLocked={Boolean(contact.userEmail)}
      submitLabel="Save changes"
      onCancel={() => router.push("/contacts")}
      onUseExisting={(existing) => router.push(`/contacts/${existing.id}`)}
      onSubmit={async (fields) => {
        const res = await updateContactAction(contact.id, fields);
        if (res.ok) router.push("/contacts");
        return res.ok ? { ok: true } : res;
      }}
    />
  );
}
