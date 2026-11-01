"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateSettingsAction } from "@/app/actions";
import { SettingLock } from "@/components/SettingLock";
import { InlineSelect } from "@/components/ui/InlineEdit";
import { BOOL_POLICIES, companyValue, POLICY_LABELS, type BoolPolicy } from "@/lib/policies";
import type { OrgSettings } from "@/lib/types";

const FIELD: Record<BoolPolicy, "showSummaryDefault" | "includeWeather" | "autoPhotoUpdate"> = {
  summary: "showSummaryDefault",
  weather: "includeWeather",
  autoPhotoUpdate: "autoPhotoUpdate",
};

/** Company values for settings projects inherit, each lockable. */
export function CompanyPolicies({ settings }: { settings: OrgSettings }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="card space-y-3 p-4" aria-labelledby="policies-heading">
      <div>
        <h2 id="policies-heading" className="field-inset text-base font-semibold">Report settings</h2>
        <p className="field-inset text-xs text-text-muted">
          Projects use these unless they choose their own. Lock a setting to make every project use it.
        </p>
      </div>
      {BOOL_POLICIES.map((k) => (
        <div key={k}>
          <label className="label" htmlFor={`co-${k}`}>{POLICY_LABELS[k]}</label>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <InlineSelect
                id={`co-${k}`}
                value={companyValue(settings, k) ? "yes" : "no"}
                onCommit={async (v) => {
                  const res = await updateSettingsAction({ [FIELD[k]]: v === "yes" });
                  setError(res.ok ? null : res.error);
                  if (res.ok) router.refresh();
                }}
                options={[
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
              />
            </div>
            <SettingLock setting={k} label={POLICY_LABELS[k]} locked={settings.locks[k]} />
          </div>
        </div>
      ))}
      {error && <p className="field-inset text-xs text-danger" role="alert">{error}</p>}
    </section>
  );
}
