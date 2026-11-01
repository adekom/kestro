"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setCompanyPolicyAction } from "@/app/actions";
import { SettingLock } from "@/components/SettingLock";
import { InlineSelect } from "@/components/ui/InlineEdit";
import { POLICIES, POLICY_NAMES, POLICY_SECTIONS, type PolicyDef, type PolicyName, type PolicySection } from "@/lib/policies";
import type { OrgSettings } from "@/lib/types";

/** Options for a setting's select: Yes/No, or its choices. */
export function policyOptions(key: PolicyName): Array<{ value: string; label: string }> {
  const def: PolicyDef = POLICIES[key];
  return def.kind === "bool"
    ? [
        { value: "yes", label: "Yes" },
        { value: "no", label: "No" },
      ]
    : [...def.options];
}
/** Select value ↔ stored value (booleans are "yes"/"no" in the select). */
export const toSelect = (key: PolicyName, v: boolean | string) => (POLICIES[key].kind === "bool" ? (v ? "yes" : "no") : String(v));
export const fromSelect = (key: PolicyName, v: string) => (POLICIES[key].kind === "bool" ? v === "yes" : v);

/** Company values for settings projects inherit, each lockable, grouped by section. */
export function CompanyPolicies({ settings, sections }: { settings: OrgSettings; sections: PolicySection[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {sections.map((section) => (
        <section key={section} className="card space-y-3 p-4" aria-labelledby={`policies-${section}`}>
          <div>
            <h2 id={`policies-${section}`} className="field-inset text-base font-semibold">{POLICY_SECTIONS[section]}</h2>
            <p className="field-inset text-xs text-text-muted">Projects use these unless they choose their own. Lock a setting to make every project use it.</p>
          </div>
          {POLICY_NAMES.filter((k) => POLICIES[k].section === section).map((k) => (
            <div key={k}>
              <label className="label" htmlFor={`co-${k}`}>{POLICIES[k].label}</label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <InlineSelect
                    id={`co-${k}`}
                    value={toSelect(k, settings.policies[k])}
                    onCommit={async (v) => {
                      const res = await setCompanyPolicyAction(k, fromSelect(k, v));
                      setError(res.ok ? null : res.error);
                      if (res.ok) router.refresh();
                    }}
                    options={policyOptions(k)}
                  />
                </div>
                <SettingLock setting={k} label={POLICIES[k].label} locked={settings.locks[k]} />
              </div>
            </div>
          ))}
        </section>
      ))}
      {error && <p className="field-inset text-xs text-danger" role="alert">{error}</p>}
    </>
  );
}
