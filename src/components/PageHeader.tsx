import Link from "next/link";

/**
 * Standard page header. The back-link line is always reserved, so titles and
 * action buttons sit in exactly the same place on every page.
 */
export function PageHeader({
  back,
  title,
  subtitle,
  actions,
}: {
  back?: { href: string; label: string };
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div>
      <div className="h-5 text-xs">
        {back && <Link href={back.href} className="link">← {back.label}</Link>}
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-3">
        <h1 className="mr-auto text-xl font-semibold">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
    </div>
  );
}
