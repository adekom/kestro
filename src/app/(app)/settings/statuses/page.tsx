import { requirePageUser } from "@/server/auth";
import { getSettings } from "@/server/services/settings";
import { SettingsNav } from "../SettingsNav";
import { StatusesEditor } from "../StatusesEditor";
import { SettingLock } from "@/components/SettingLock";
import { PageHeader } from "@/components/PageHeader";

export default async function StatusSettingsPage() {
  await requirePageUser("admin");
  const settings = await getSettings();
  return (
    <main className="page">
      <PageHeader title="Settings" />
      <SettingsNav />
      <div className="form-width space-y-6">
        <StatusesEditor
          statuses={settings.statuses}
          resolvedStatusId={settings.resolvedStatusId}
          defaultStatusId={settings.defaultStatusId}
          lock={<SettingLock setting="statuses" label="Observation statuses" locked={settings.locks.statuses} />}
        />
      </div>
    </main>
  );
}
