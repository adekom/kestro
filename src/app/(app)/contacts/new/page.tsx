"use client";

import { useRouter } from "next/navigation";
import { createContactAction } from "@/app/actions";
import { ContactForm } from "@/components/ContactForm";
import { PageHeader } from "@/components/PageHeader";

export default function NewContactPage() {
  const router = useRouter();
  return (
    <main className="page">
      <PageHeader back={{ href: "/contacts", label: "Contacts" }} title="New contact" />
      <div className="card form-width p-4">
        <ContactForm
          submitLabel="Create contact"
          onCancel={() => router.push("/contacts")}
          onUseExisting={(existing) => router.push(`/contacts/${existing.id}`)}
          onSubmit={async (fields) => {
            const res = await createContactAction(fields);
            if (res.ok) router.push("/contacts");
            return res.ok ? { ok: true } : res;
          }}
        />
      </div>
    </main>
  );
}
