import { requirePageUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings";
import { SettingsNav } from "./SettingsNav";
import { OrganizationForm } from "./OrganizationForm";
import { StatusesEditor } from "./StatusesEditor";
import { LogoUpload } from "./LogoUpload";

export default async function SettingsPage() {
  await requirePageUser("admin");
  const settings = await getSettings();
  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <SettingsNav />
      <OrganizationForm settings={settings} />
      <LogoUpload hasLogo={Boolean(settings.logoPath)} />
      <StatusesEditor statuses={settings.statuses} resolvedStatusId={settings.resolvedStatusId} />
    </main>
  );
}

