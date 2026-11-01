import { requirePageUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings";
import { SettingsNav } from "./SettingsNav";
import { OrganizationForm } from "./OrganizationForm";
import { LogoUpload } from "./LogoUpload";
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
      </div>
    </main>
  );
}
