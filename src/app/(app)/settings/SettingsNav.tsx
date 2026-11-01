import { TabNav } from "@/components/TabNav";

export function SettingsNav() {
  return (
    <TabNav
      label="Settings"
      tabs={[
        { href: "/settings", label: "Company Details", exact: true },
        { href: "/settings/reports", label: "Report Settings" },
        { href: "/settings/statuses", label: "Observation Statuses" },
      ]}
    />
  );
}
