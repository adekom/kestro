import { requirePageUser } from "@/server/auth";
import { AddStaffForm } from "./AddStaffForm";
import { PageHeader } from "@/components/PageHeader";

export default async function AddStaffPage() {
  await requirePageUser("admin");
  return (
    <main className="page">
      <PageHeader
        back={{ href: "/settings/users", label: "Staff" }}
        title="Add staff member"
        subtitle="They can sign in with an email link sent to this address. They are also added to the firm contact list (or linked to their existing contact)."
      />
      <div className="form-width">
        <AddStaffForm />
      </div>
    </main>
  );
}
