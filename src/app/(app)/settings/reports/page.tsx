import { requirePageUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings";
import { SettingsNav } from "../SettingsNav";
import { CompanyPolicies } from "../CompanyPolicies";
import { CompanyWideSettings } from "../CompanyWideSettings";
import { PageHeader } from "@/components/PageHeader";

export default async function ReportSettingsPage() {
  await requirePageUser("admin");
  const settings = await getSettings();
  return (
    <main className="page">
      <PageHeader title="Settings" />
      <SettingsNav />
      <div className="form-width space-y-6">
        <CompanyPolicies settings={settings} sections={["observations"]} />
        <CompanyWideSettings settings={settings} part="general" />
      </div>
    </main>
  );
}
