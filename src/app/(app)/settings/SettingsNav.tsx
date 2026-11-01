import { NavLink } from "@/components/NavLink";

export function SettingsNav() {
  return (
    <nav className="flex gap-1 text-sm" aria-label="Settings">
      <NavLink href="/settings" exact>Company Details</NavLink>
      <NavLink href="/settings/reports">Report Settings</NavLink>
      <NavLink href="/settings/statuses">Observation Statuses</NavLink>
      <NavLink href="/settings/users">Staff</NavLink>
    </nav>
  );
}
