import { requirePageUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings";
import { SettingsNav } from "./SettingsNav";
import { OrganizationForm } from "./OrganizationForm";
import { StatusesEditor } from "./StatusesEditor";
import { LogoUpload } from "./LogoUpload";
import { CompanyPolicies } from "./CompanyPolicies";
import { SettingLock } from "@/components/SettingLock";
import { PageHeader } from "@/components/PageHeader";

export default async function SettingsPage() {
  await requirePageUser("admin");
  const settings = await getSettings();
  return (
    <main className="page">
      <PageHeader title="Settings" />
      <SettingsNav />
      <div className="form-width space-y-6">
      <OrganizationForm settings={settings} />
      <LogoUpload hasLogo={Boolean(settings.logoPath)} />
      <CompanyPolicies settings={settings} />
      <StatusesEditor
        statuses={settings.statuses}
        resolvedStatusId={settings.resolvedStatusId}
        lock={<SettingLock setting="statuses" label="Observation statuses" locked={settings.locks.statuses} />}
      />
      </div>
    </main>
  );
}

