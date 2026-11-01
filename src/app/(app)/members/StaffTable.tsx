"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUserAction } from "@/app/actions";
import { ContactDetailsEditor } from "@/components/ContactDetailsEditor";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { InlineSelect } from "@/components/ui/InlineEdit";
import { Modal } from "@/components/ui/Modal";
import { SlideOver } from "@/components/ui/SlideOver";
import { contactName, formatLongDate } from "@/lib/domain";
import type { AppUser, Contact, Role } from "@/lib/types";
import { AddStaffForm } from "./AddStaffForm";
import { ContactProjects } from "./ContactProjects";
import type { ContactProject } from "./projectsByContact";

type StaffRow = AppUser & { contact: Contact | null };

const PERMISSIONS: Record<Role, string> = { editor: "Editor", admin: "Admin" };
const name = (u: StaffRow) => (u.contact ? contactName(u.contact) : "") || u.email;

/**
 * The firm's own people. Only listed, enabled staff can sign in; admins
 * manage permissions and access. Everyone can see the list.
 */
export function StaffTable({
  users,
  currentEmail,
  isAdmin,
  projects,
}: {
  users: StaffRow[];
  currentEmail: string;
  isAdmin: boolean;
  projects: Record<string, ContactProject[]>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [openEmail, setOpenEmail] = useState<string | null>(null);
  const open = users.find((u) => u.email === openEmail) ?? null;

  const columns: Column<StaffRow>[] = [
    {
      id: "name",
      header: "Name",
      weight: 2,
      cell: (u) => (
        <>
          <span className="font-medium">{name(u)}</span>
          {u.email === currentEmail && <span className="ml-1 text-xs text-text-muted">(you)</span>}
        </>
      ),
      sortValue: (u) => (u.contact ? `${u.contact.lastName} ${u.contact.firstName}` : u.email),
    },
    { id: "email", header: "Email", weight: 2.5, cell: (u) => u.email, sortValue: (u) => u.email },
    { id: "title", header: "Title", weight: 1.8, cell: (u) => u.contact?.title ?? "", sortValue: (u) => u.contact?.title ?? "" },
    { id: "role", header: "Role", weight: 1.6, cell: (u) => u.contact?.defaultRole ?? "", sortValue: (u) => u.contact?.defaultRole ?? "" },
    { id: "permissions", header: "Permissions", weight: 1.1, cell: (u) => PERMISSIONS[u.role], sortValue: (u) => u.role },
    {
      id: "access",
      header: "Access",
      weight: 1,
      cell: (u) => (u.enabled ? "Enabled" : <span className="text-danger">Disabled</span>),
      sortValue: (u) => (u.enabled ? 0 : 1),
    },
    {
      id: "signin",
      header: "Last sign-in",
      weight: 1.4,
      cell: (u) => (u.lastSignInAt ? formatLongDate(u.lastSignInAt.slice(0, 10)) : <span className="text-text-muted">Never</span>),
      sortValue: (u) => u.lastSignInAt ?? "",
    },
  ];

  return (
    <>
      <DataTable
        storageKey="staff"
        rows={users}
        columns={columns}
        rowId={(u) => u.email}
        selectable={false}
        filterText={(u) => `${name(u)} ${u.email} ${u.contact?.title ?? ""} ${u.contact?.defaultRole ?? ""} ${PERMISSIONS[u.role]}`}
        filterPlaceholder="Filter staff"
        onCreate={isAdmin ? () => setAdding(true) : undefined}
        createLabel="Add staff member"
        onRowClick={(u) => setOpenEmail((e) => (e === u.email ? null : u.email))}
        activeRowId={openEmail}
        initialSort={{ id: "name", dir: "asc" }}
        emptyMessage="No staff yet."
      />
      <Modal open={adding} onClose={() => setAdding(false)} title="Add staff member">
        <AddStaffForm
          onDone={() => {
            setAdding(false);
            router.refresh();
          }}
          onCancel={() => setAdding(false)}
        />
      </Modal>
      <SlideOver open={Boolean(open)} onClose={() => setOpenEmail(null)} title={open ? name(open) : "Staff member"}>
        {open && (
          <StaffEditor
            key={open.email}
            user={open}
            isAdmin={isAdmin}
            isSelf={open.email === currentEmail}
            projects={open.contact ? (projects[open.contact.id] ?? []) : []}
            onChanged={() => router.refresh()}
          />
        )}
      </SlideOver>
    </>
  );
}

function StaffEditor({
  user,
  isAdmin,
  isSelf,
  projects,
  onChanged,
}: {
  user: StaffRow;
  isAdmin: boolean;
  isSelf: boolean;
  projects: ContactProject[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const run = async (p: ReturnType<typeof updateUserAction>) => {
    const res = await p;
    setError(res.ok ? null : res.error);
    if (res.ok) onChanged();
  };
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h3 className="field-inset text-sm font-semibold">Sign-in</h3>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <label className="label" htmlFor="staff-permissions">Permissions</label>
            {isAdmin ? (
              <InlineSelect
                id="staff-permissions"
                value={user.role}
                onCommit={(v) => run(updateUserAction(user.email, { role: v as Role }))}
                options={[
                  { value: "editor", label: "Editor" },
                  { value: "admin", label: "Admin" },
                ]}
              />
            ) : (
              <p className="field-inset py-2 text-sm">{PERMISSIONS[user.role]}</p>
            )}
          </div>
          <div>
            <span className="label">Last sign-in</span>
            <p className="field-inset py-2 text-sm">{user.lastSignInAt ? formatLongDate(user.lastSignInAt.slice(0, 10)) : "Never"}</p>
          </div>
        </div>
        {isAdmin && !isSelf && (
          <button type="button" className={`btn ${user.enabled ? "btn-danger" : "btn-primary"}`} onClick={() => run(updateUserAction(user.email, { enabled: !user.enabled }))}>
            {user.enabled ? "Disable sign-in" : "Enable sign-in"}
          </button>
        )}
        {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      </section>

      {user.contact && (
        <section className="space-y-2">
          <h3 className="field-inset text-sm font-semibold">Contact details</h3>
          <ContactDetailsEditor contact={user.contact} onSaved={onChanged} />
        </section>
      )}

      <ContactProjects projects={projects} />
    </div>
  );
}
