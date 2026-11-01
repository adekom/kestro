"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createContactAction, deleteContactsAction } from "@/app/actions";
import { ContactDetailsEditor } from "@/components/ContactDetailsEditor";
import { ContactForm, EMPTY_CONTACT } from "@/components/ContactForm";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { SlideOver } from "@/components/ui/SlideOver";
import { contactName } from "@/lib/domain";
import type { Contact } from "@/lib/types";
import { ContactProjects } from "../ContactProjects";
import type { ContactProject } from "../projectsByContact";

const COLUMNS: Column<Contact>[] = [
  { id: "name", header: "Name", weight: 2, cell: (c) => <span className="font-medium">{contactName(c)}</span>, sortValue: (c) => `${c.lastName} ${c.firstName}` },
  { id: "email", header: "Email", weight: 2.5, cell: (c) => c.email, sortValue: (c) => c.email },
  { id: "phone", header: "Phone", weight: 1.5, cell: (c) => c.phone, sortValue: (c) => c.phone },
  { id: "company", header: "Company", weight: 2, cell: (c) => c.company, sortValue: (c) => c.company },
  { id: "title", header: "Title", weight: 1.8, cell: (c) => c.title, sortValue: (c) => c.title },
  { id: "role", header: "Role", weight: 1.8, cell: (c) => c.defaultRole, sortValue: (c) => c.defaultRole },
];

/**
 * Everyone outside the firm. Unlike a project's contact list, removing
 * someone here deletes them from Kestro (and from every project).
 */
export function ExternalContactsTable({ contacts, projects }: { contacts: Contact[]; projects: Record<string, ContactProject[]> }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Contact[] | null>(null);
  const open = contacts.find((c) => c.id === openId) ?? null;
  const projectCount = (list: Contact[]) => new Set(list.flatMap((c) => (projects[c.id] ?? []).map((p) => p.id))).size;

  return (
    <>
      <DataTable
        storageKey="external-contacts"
        rows={contacts}
        columns={COLUMNS}
        rowId={(c) => c.id}
        filterText={(c) => `${contactName(c)} ${c.email} ${c.phone} ${c.company} ${c.title} ${c.defaultRole}`}
        filterPlaceholder="Filter contacts"
        onCreate={() => setAdding(true)}
        createLabel="New contact"
        onRowClick={(c) => setOpenId((id) => (id === c.id ? null : c.id))}
        activeRowId={openId}
        selectionActions={(selected) => (
          <button type="button" className="btn btn-danger" onClick={() => setDeleting(selected)}>
            <Trash2 className="h-4 w-4" aria-hidden /> Delete
          </button>
        )}
        rowActions={(c) => [{ label: "Delete from Kestro", icon: Trash2, danger: true, onSelect: () => setDeleting([c]) }]}
        initialSort={{ id: "name", dir: "asc" }}
        emptyMessage="No external contacts yet."
      />

      <Modal open={adding} onClose={() => setAdding(false)} title="New contact">
        <ContactForm
          initial={EMPTY_CONTACT}
          submitLabel="Create contact"
          onCancel={() => setAdding(false)}
          onUseExisting={(existing) => {
            setAdding(false);
            setOpenId(existing.id);
          }}
          onSubmit={async (fields) => {
            const res = await createContactAction(fields);
            if (res.ok) {
              setAdding(false);
              router.refresh();
              return { ok: true as const };
            }
            return res;
          }}
        />
      </Modal>

      <SlideOver open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? contactName(open) || open.email : "Contact"}>
        {open && (
          <div key={open.id} className="space-y-6">
            <ContactDetailsEditor contact={open} onSaved={() => router.refresh()} />
            <ContactProjects projects={projects[open.id] ?? []} />
            <section className="border-t border-border pt-4">
              <button type="button" className="btn btn-danger" onClick={() => setDeleting([open])}>
                <Trash2 className="h-4 w-4" aria-hidden /> Delete from Kestro
              </button>
            </section>
          </div>
        )}
      </SlideOver>

      <ConfirmDialog
        open={Boolean(deleting)}
        title={deleting && deleting.length > 1 ? `Delete ${deleting.length} contacts?` : "Delete contact?"}
        confirmLabel="Delete"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const ids = (deleting ?? []).map((c) => c.id);
          const res = await deleteContactsAction(ids);
          if (!res.ok) return res.error;
          if (openId && ids.includes(openId)) setOpenId(null);
          router.refresh();
          return null;
        }}
      >
        {deleting && deleting.length === 1 ? (
          <p>
            <span className="font-medium">{contactName(deleting[0]) || deleting[0].email}</span> will be deleted from Kestro
            {projectCount(deleting) > 0 && <> and removed from {projectCount(deleting)} project{projectCount(deleting) > 1 ? "s" : ""}</>}.
          </p>
        ) : (
          <>
            <p>
              These contacts will be deleted from Kestro
              {deleting && projectCount(deleting) > 0 && <> and removed from {projectCount(deleting)} project{projectCount(deleting) > 1 ? "s" : ""}</>}:
            </p>
            <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5">
              {deleting?.map((c) => <li key={c.id}>{contactName(c) || c.email}</li>)}
            </ul>
          </>
        )}
        <p className="mt-2 text-text-muted">Attendance already recorded in reports keeps their name. This can’t be undone.</p>
      </ConfirmDialog>
    </>
  );
}
