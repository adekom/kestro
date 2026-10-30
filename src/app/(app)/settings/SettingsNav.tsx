import { NavLink } from "@/components/NavLink";

export function SettingsNav() {
  return (
    <nav className="flex gap-1 text-sm" aria-label="Settings">
      <NavLink href="/settings" exact>Organization</NavLink>
      <NavLink href="/settings/users">Staff</NavLink>
    </nav>
  );
}
