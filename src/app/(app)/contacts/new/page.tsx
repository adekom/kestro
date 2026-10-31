"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContactAction } from "@/app/actions";
import { ContactForm } from "@/components/ContactForm";

export default function NewContactPage() {
  const router = useRouter();
  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 p-6">
      <Link href="/contacts" className="link text-xs">← Contacts</Link>
      <h1 className="text-xl font-semibold">New contact</h1>
      <div className="card p-4">
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
