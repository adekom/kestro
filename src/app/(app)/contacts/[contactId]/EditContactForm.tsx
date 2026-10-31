"use client";

import { useRouter } from "next/navigation";
import { ContactDetailsEditor } from "@/components/ContactDetailsEditor";
import type { Contact } from "@/lib/types";

export function EditContactForm({ contact }: { contact: Contact }) {
  const router = useRouter();
  return <ContactDetailsEditor contact={contact} onSaved={() => router.refresh()} />;
}
