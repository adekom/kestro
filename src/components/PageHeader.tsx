import Link from "next/link";
import { ArrowLeft } from "lucide-react";

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
        {back && (
          <Link href={back.href} className="link inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> {back.label}
          </Link>
        )}
      </div>
      <div className="flex min-h-9 flex-wrap items-center gap-3">
        <h1 className="page-title mr-auto">{title}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
    </div>
  );
}
