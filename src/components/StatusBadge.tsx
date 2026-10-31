import type { StatusDef } from "@/lib/types";

/** Shows a firm-configured status with its own colour; app teal never overrides it. */
export function StatusBadge({ status }: { status: StatusDef | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
        style={{ backgroundColor: status?.color ?? "transparent" }}
      />
      {status?.label ?? "No status"}
    </span>
  );
}
