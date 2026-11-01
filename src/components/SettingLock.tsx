"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, LockOpen } from "lucide-react";
import { setSettingLockAction } from "@/app/actions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PolicyKey } from "@/lib/policies";

/** Company-level lock for a setting. Locking returns every project to the company value. */
export function SettingLock({ setting, label, locked }: { setting: PolicyKey; label: string; locked: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unlock = async () => {
    const res = await setSettingLockAction(setting, false);
    setError(res.ok ? null : res.error);
    if (res.ok) router.refresh();
  };
  const Icon = locked ? Lock : LockOpen;
  return (
    <>
      <button
        type="button"
        className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-surface-muted ${locked ? "font-medium text-text" : "text-text-muted"}`}
        aria-pressed={locked}
        aria-label={`${locked ? "Unlock" : "Lock"} “${label}”`}
        title={locked ? "Locked: projects use the company setting. Click to let projects choose." : "Unlocked: projects can choose their own. Click to lock."}
        onClick={() => (locked ? void unlock() : setConfirming(true))}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden /> {locked ? "Locked" : "Unlocked"}
      </button>
      {error && <p className="text-xs text-danger" role="alert">{error}</p>}
      <ConfirmDialog
        open={confirming}
        title="Lock this setting?"
        confirmLabel="Lock"
        onClose={() => setConfirming(false)}
        onConfirm={async () => {
          const res = await setSettingLockAction(setting, true);
          if (!res.ok) return res.error;
          router.refresh();
          return null;
        }}
      >
        <p>
          Every project will use the company setting for <span className="font-medium">{label.replace(/.$/, "")}</span>. Projects that chose their own will
          switch to the company setting, and project settings can’t change it while it’s locked.
        </p>
      </ConfirmDialog>
    </>
  );
}
