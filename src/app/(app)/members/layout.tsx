import { requirePageUser } from "@/server/auth";
import { PageHeader } from "@/components/PageHeader";
import { TabNav } from "@/components/TabNav";

/** Everyone the firm works with: its own staff, and contacts outside the firm. */
export default async function MembersLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser();
  return (
    <main className="page">
      <PageHeader title="Members" />
      <TabNav
        label="Members"
        tabs={[
          { href: "/members", label: "Staff", exact: true },
          { href: "/members/contacts", label: "External Contacts" },
        ]}
      />
      {children}
    </main>
  );
}
