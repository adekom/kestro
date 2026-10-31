"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  addProjectContactsAction,
  removeProjectContactAction,
  setProjectContactRoleAction,
  updateContactAction,
} from "@/app/actions";
import { ContactForm } from "@/components/ContactForm";
import { ContactPicker } from "@/components/ContactPicker";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { SlideOver } from "@/components/ui/SlideOver";
import { contactName } from "@/lib/domain";
import type { Contact, ProjectContact } from "@/lib/types";
import type { ContactRow } from "@/server/services/tables";

const COLUMNS: Column<ContactRow>[] = [
  {
    id: "name",
    header: "Name",
    weight: 2,
    cell: (r) => (
      <>
        <span className="font-medium">{contactName(r.contact)}</span>
        {r.contact.userEmail && <span className="ml-2 rounded bg-surface-muted px-1.5 py-0.5 text-xs text-text-muted">staff</span>}
      </>
    ),
    sortValue: (r) => `${r.contact.lastName} ${r.contact.firstName}`,
  },
  { id: "email", header: "Email", weight: 2.5, cell: (r) => r.contact.email, sortValue: (r) => r.contact.email },
  { id: "phone", header: "Phone", weight: 1.5, cell: (r) => r.contact.phone, sortValue: (r) => r.contact.phone },
  { id: "company", header: "Company", weight: 2, cell: (r) => r.contact.company, sortValue: (r) => r.contact.company },
  { id: "role", header: "Role", weight: 2, cell: (r) => r.projectRole, sortValue: (r) => r.projectRole },
];

export function ContactsTable({
  projectId,
  rows,
  firmContacts,
  existingIds,
}: {
  projectId: string;
  rows: ContactRow[];
  firmContacts: Contact[];
  existingIds: string[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.contact.id === openId) ?? null;

  return (
    <>
      <DataTable
        storageKey="project-contacts"
        rows={rows}
        columns={COLUMNS}
        rowId={(r) => r.contact.id}
        filterText={(r) => `${contactName(r.contact)} ${r.contact.email} ${r.contact.phone} ${r.contact.company} ${r.projectRole}`}
        filterPlaceholder="Filter contacts"
        onCreate={() => setAdding(true)}
        createLabel="Add contacts"
        onRowClick={(r) => setOpenId((id) => (id === r.contact.id ? null : r.contact.id))}
        activeRowId={openId}
        initialSort={{ id: "name", dir: "asc" }}
        emptyMessage="No contacts on this project yet."
      />
      <Modal open={adding} onClose={() => setAdding(false)} title="Add contacts to project" width="max-w-3xl">
        <AddContacts
          projectId={projectId}
          firmContacts={firmContacts}
          existingIds={existingIds}
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      </Modal>
      <SlideOver open={Boolean(open)} onClose={() => setOpenId(null)} title={open ? contactName(open.contact) : "Contact"}>
        {open && (
          <ContactEditor
            key={open.contact.id}
            projectId={projectId}
            row={open}
            onChanged={() => router.refresh()}
            onRemoved={() => {
              setOpenId(null);
              router.refresh();
            }}
          />
        )}
      </SlideOver>
    </>
  );
}

function AddContacts({
  projectId,
  firmContacts,
  existingIds,
  onDone,
  onCancel,
}: {
  projectId: string;
  firmContacts: Contact[];
  existingIds: string[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<ProjectContact[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4">
      <ContactPicker contacts={firmContacts} excludeIds={existingIds} selected={selected} onChange={setSelected} />
      {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || selected.length === 0}
          onClick={async () => {
            setBusy(true);
            const res = await addProjectContactsAction(projectId, selected);
            setBusy(false);
            if (res.ok) onDone();
            else setError(res.error);
          }}
        >
          Add {selected.length || ""} to project
        </button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ContactEditor({
  projectId,
  row,
  onChanged,
  onRemoved,
}: {
  projectId: string;
  row: ContactRow;
  onChanged: () => void;
  onRemoved: () => void;
}) {
  const [role, setRole] = useState(row.projectRole);
  const [roleState, setRoleState] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">On this project</h3>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label" htmlFor="project-role">Role</label>
            <input id="project-role" className="input" placeholder="e.g. Contractor" value={role} onChange={(e) => setRole(e.target.value)} />
          </div>
          <button
            type="button"
            className="btn"
            disabled={role === row.projectRole}
            onClick={async () => {
              const res = await setProjectContactRoleAction(projectId, row.contact.id, role);
              setRoleState(res.ok ? "Saved" : res.error);
              if (res.ok) onChanged();
            }}
          >
            Save role
          </button>
        </div>
        {roleState && <p className="text-xs text-text-muted" role="status">{roleState}</p>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Contact details</h3>
        <p className="text-xs text-text-muted">These details are shared by every project this person is on.</p>
        <ContactForm
          initial={row.contact}
          emailLocked={Boolean(row.contact.userEmail)}
          submitLabel={saved ? "Saved" : "Save details"}
          onSubmit={async (fields) => {
            const res = await updateContactAction(row.contact.id, fields);
            if (!res.ok) return res;
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
            onChanged();
            return { ok: true };
          }}
        />
      </section>

      <section className="border-t border-border pt-4">
        <button
          type="button"
          className="btn btn-danger"
          onClick={async () => {
            if (!window.confirm(`Remove ${contactName(row.contact)} from this project? They stay in the firm contact list.`)) return;
            const res = await removeProjectContactAction(projectId, row.contact.id);
            if (res.ok) onRemoved();
            else setRoleState(res.error);
          }}
        >
          Remove from project
        </button>
      </section>
    </div>
  );
}
