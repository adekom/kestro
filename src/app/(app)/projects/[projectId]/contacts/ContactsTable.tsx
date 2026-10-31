"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserMinus } from "lucide-react";
import {
  addProjectContactsAction,
  removeProjectContactsAction,
  setProjectContactRoleAction,
} from "@/app/actions";
import { ContactDetailsEditor } from "@/components/ContactDetailsEditor";
import { InlineText } from "@/components/ui/InlineEdit";
import { ContactPicker } from "@/components/ContactPicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
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
  // Contacts awaiting confirmation of removal (from ticked rows, a row menu or the panel).
  const [removing, setRemoving] = useState<ContactRow[] | null>(null);
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
        selectionActions={(selected) => (
          <button type="button" className="btn btn-danger" onClick={() => setRemoving(selected)}>
            <UserMinus className="h-4 w-4" aria-hidden /> Remove from Project
          </button>
        )}
        rowActions={(r) => [{ label: "Remove from project", icon: UserMinus, danger: true, onSelect: () => setRemoving([r]) }]}
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
            onRemove={() => setRemoving([open])}
          />
        )}
      </SlideOver>
      <ConfirmDialog
        open={Boolean(removing)}
        title={removing && removing.length > 1 ? `Remove ${removing.length} contacts from project?` : "Remove contact from project?"}
        confirmLabel="Remove from project"
        danger
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          const ids = (removing ?? []).map((r) => r.contact.id);
          const res = await removeProjectContactsAction(projectId, ids);
          if (!res.ok) return res.error;
          if (openId && ids.includes(openId)) setOpenId(null);
          router.refresh();
          return null;
        }}
      >
        <p>
          {removing && removing.length === 1 ? (
            <><span className="font-medium">{contactName(removing[0].contact)}</span> will be removed from this project.</>
          ) : (
            <>These contacts will be removed from this project:</>
          )}
        </p>
        {removing && removing.length > 1 && (
          <ul className="mt-2 max-h-40 list-disc overflow-y-auto pl-5">
            {removing.map((r) => <li key={r.contact.id}>{contactName(r.contact)}</li>)}
          </ul>
        )}
        <p className="mt-2 text-text-muted">They stay in the firm contact list and can be added back at any time.</p>
      </ConfirmDialog>
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
  onRemove,
}: {
  projectId: string;
  row: ContactRow;
  onChanged: () => void;
  onRemove: () => void;
}) {
  const [role, setRole] = useState(row.projectRole);
  const [roleError, setRoleError] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">On this project</h3>
        <div>
          <label className="label" htmlFor="project-role">Role</label>
          <InlineText
            id="project-role"
            placeholder="e.g. Contractor"
            value={role}
            onCommit={async (v) => {
              setRole(v);
              const res = await setProjectContactRoleAction(projectId, row.contact.id, v);
              setRoleError(res.ok ? null : res.error);
              if (res.ok) onChanged();
            }}
          />
        </div>
        {roleError && <p className="text-xs text-danger" role="alert">{roleError}</p>}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Contact details</h3>
        <p className="text-xs text-text-muted">These details are shared by every project this person is on.</p>
        <ContactDetailsEditor contact={row.contact} onSaved={onChanged} />
      </section>

      <section className="border-t border-border pt-4">
        <button type="button" className="btn btn-danger" onClick={onRemove}>
          <UserMinus className="h-4 w-4" aria-hidden /> Remove from project
        </button>
      </section>
    </div>
  );
}
