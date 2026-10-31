"use client";

import { useRouter } from "next/navigation";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { contactName } from "@/lib/domain";
import type { Contact } from "@/lib/types";

const COLUMNS: Column<Contact>[] = [
  {
    id: "name",
    header: "Name",
    weight: 2,
    cell: (c) => (
      <>
        <span className="font-medium">{contactName(c)}</span>
        {c.userEmail && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-text-muted">staff</span>}
      </>
    ),
    sortValue: (c) => `${c.lastName} ${c.firstName}`,
  },
  { id: "email", header: "Email", weight: 2.5, cell: (c) => c.email, sortValue: (c) => c.email },
  { id: "phone", header: "Phone", weight: 1.5, cell: (c) => c.phone, sortValue: (c) => c.phone },
  { id: "company", header: "Company", weight: 2, cell: (c) => c.company, sortValue: (c) => c.company },
  { id: "title", header: "Title", weight: 2, cell: (c) => c.title, sortValue: (c) => c.title },
];

/** The firm-wide contact list. */
export function ContactTable({ contacts }: { contacts: Contact[] }) {
  const router = useRouter();
  return (
    <DataTable
      storageKey="firm-contacts"
      rows={contacts}
      columns={COLUMNS}
      rowId={(c) => c.id}
      filterText={(c) => `${contactName(c)} ${c.email} ${c.phone} ${c.company} ${c.title}`}
      filterPlaceholder="Filter contacts"
      onCreate={() => router.push("/contacts/new")}
      createLabel="New contact"
      onRowClick={(c) => router.push(`/contacts/${c.id}`)}
      initialSort={{ id: "name", dir: "asc" }}
      emptyMessage="No contacts yet."
    />
  );
}
