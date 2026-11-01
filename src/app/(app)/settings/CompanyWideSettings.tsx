"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { updateSettingsAction } from "@/app/actions";
import { InlineSelect, InlineText } from "@/components/ui/InlineEdit";
import { formatLongDate } from "@/lib/domain";
import { toRgba } from "@/lib/markup";
import type { OrgSettings, PdfSection } from "@/lib/types";

const SECTION_LABELS: Record<PdfSection, string> = {
  attendance: "Attendance",
  ongoingWork: "Ongoing work",
  observations: "Observations",
  summary: "Summary of observations",
};
const SAMPLE_DATE = "2026-07-14";

/** Settings that apply to the whole company; projects can't change them. */
export function CompanyWideSettings({ settings, part }: { settings: OrgSettings; part: "general" | "pdf" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const save = async (patch: Parameters<typeof updateSettingsAction>[0]) => {
    const res = await updateSettingsAction(patch);
    setError(res.ok ? null : res.error);
    if (res.ok) router.refresh();
  };
  const select = (id: string, label: string, value: string, options: Array<{ value: string; label: string }>, onCommit: (v: string) => void) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <InlineSelect id={id} value={value} onCommit={onCommit} options={options} />
    </div>
  );
  const text = (id: string, label: string, value: string, onCommit: (v: string) => void, placeholder?: string) => (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <InlineText id={id} value={value} placeholder={placeholder} onCommit={onCommit} />
    </div>
  );

  const order = settings.pdfSectionOrder;
  const move = (i: number, d: number) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    void save({ pdfSectionOrder: next });
  };
  const palette = settings.markupPalette;

  if (part === "pdf") {
    return (
      <>
        <section className="card space-y-3 p-4" aria-labelledby="pdf-layout-heading">
          <div>
            <h2 id="pdf-layout-heading" className="field-inset text-base font-semibold">Page</h2>
            <p className="field-inset text-xs text-text-muted">These apply to every project.</p>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            {select("co-page", "PDF page size", settings.pageSize, [
              { value: "LETTER", label: "US Letter" },
              { value: "A4", label: "A4" },
            ], (v) => save({ pageSize: v as OrgSettings["pageSize"] }))}
          </div>
        </section>
        <section className="card space-y-3 p-4" aria-labelledby="pdf-order-heading">
          <div>
            <h2 id="pdf-order-heading" className="field-inset text-base font-semibold">PDF section order</h2>
            <p className="field-inset text-xs text-text-muted">Between the report details at the top and the disclaimer at the end.</p>
          </div>
          <ol className="divide-y divide-border">
            {order.map((s, i) => (
              <li key={s} className="field-inset flex items-center gap-2 py-1.5 text-sm">
                <span className="w-5 text-text-muted">{i + 1}.</span>
                <span className="flex-1">{SECTION_LABELS[s]}</span>
                <button type="button" className="btn" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${SECTION_LABELS[s]} up`}>
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" className="btn" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${SECTION_LABELS[s]} down`}>
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ol>
        </section>
        {error && <p className="field-inset text-xs text-danger" role="alert">{error}</p>}
      </>
    );
  }

  return (
    <>
      <section className="card space-y-3 p-4" aria-labelledby="company-wide-heading">
        <div>
          <h2 id="company-wide-heading" className="field-inset text-base font-semibold">Numbers, dates and labels</h2>
          <p className="field-inset text-xs text-text-muted">These apply to every project.</p>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {select("co-number", "Observation numbers", settings.numberFormat, [
            { value: "dot", label: "3.2 (report, then order)" },
            { value: "dash", label: "3-2 (report, then order)" },
            { value: "running", label: "1, 2, 3… across the project" },
          ], (v) => save({ numberFormat: v as OrgSettings["numberFormat"] }))}
          {select("co-date", "Date format", settings.dateFormat, [
            { value: "us", label: formatLongDate(SAMPLE_DATE, "us") },
            { value: "intl", label: formatLongDate(SAMPLE_DATE, "intl") },
            { value: "iso", label: formatLongDate(SAMPLE_DATE, "iso") },
          ], (v) => save({ dateFormat: v as OrgSettings["dateFormat"] }))}
          {text("co-prefix", "Report label for new projects", settings.defaultReportPrefix, (v) => save({ defaultReportPrefix: v }), "e.g. Field Report ")}
          {text("co-ungrouped", "Heading for observations without a group", settings.ungroupedLabel, (v) => save({ ungroupedLabel: v }))}
        </div>
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="photos-heading">
        <h2 id="photos-heading" className="field-inset text-base font-semibold">Photos and automatic updates</h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {text("co-photo-added", "Automatic update for the first photo", settings.photoAddedText, (v) => save({ photoAddedText: v }))}
          {text("co-photos-added", "…and once there are more", settings.photosAddedText, (v) => save({ photosAddedText: v }))}
        </div>
        {select("co-revoke", "When a photo is removed from an observation, stop its public link working", settings.revokeLinksOnRemove ? "yes" : "no", [
          { value: "no", label: "No (links in sent PDFs keep working)" },
          { value: "yes", label: "Yes" },
        ], (v) => save({ revokeLinksOnRemove: v === "yes" }))}
      </section>

      <section className="card space-y-3 p-4" aria-labelledby="markup-heading">
        <h2 id="markup-heading" className="field-inset text-base font-semibold">Photo markup</h2>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <span className="label">Default colour</span>
            <div className="field-inset flex flex-wrap items-center gap-1.5 py-1">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  title={toRgba(c)}
                  aria-label={`Use ${toRgba(c)} as the default colour`}
                  aria-pressed={settings.markupDefaultColor === c}
                  onClick={() => save({ markupDefaultColor: c })}
                  className={`h-6 w-6 rounded border border-black/15 ${settings.markupDefaultColor === c ? "ring-2 ring-primary ring-offset-1" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          {select("co-stroke", "Default stroke width", settings.markupDefaultStroke, [
            { value: "s", label: "Thin" },
            { value: "m", label: "Medium" },
            { value: "l", label: "Thick" },
          ], (v) => save({ markupDefaultStroke: v as OrgSettings["markupDefaultStroke"] }))}
        </div>
        <div>
          <span className="label">Colours to choose from</span>
          <ul className="field-inset flex flex-wrap items-center gap-2 py-1">
            {palette.map((c) => (
              <li key={c} className="flex items-center gap-1 rounded border border-border py-0.5 pr-0.5 pl-1">
                <span className="h-5 w-5 rounded border border-black/15" style={{ backgroundColor: c }} aria-hidden />
                <span className="font-mono text-xs">{toRgba(c)}</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-text-muted hover:bg-surface-muted hover:text-text disabled:invisible"
                  disabled={palette.length === 1}
                  aria-label={`Remove ${toRgba(c)}`}
                  onClick={() => {
                    const next = palette.filter((x) => x !== c);
                    void save({ markupPalette: next, ...(settings.markupDefaultColor === c ? { markupDefaultColor: next[0] } : {}) });
                  }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
            {palette.length < 16 && (
              <li>
                <AddColour onAdd={(c) => !palette.includes(c) && void save({ markupPalette: [...palette, c] })} />
              </li>
            )}
          </ul>
        </div>
      </section>
      {error && <p className="field-inset text-xs text-danger" role="alert">{error}</p>}
    </>
  );
}

/** Opens the colour picker; adds the colour once the picker closes (not while dragging). */
function AddColour({ onAdd }: { onAdd: (hex: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const add = useRef(onAdd);
  add.current = onAdd;
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const done = () => add.current(el.value.toUpperCase());
    el.addEventListener("change", done);
    return () => el.removeEventListener("change", done);
  }, []);
  return (
    <label className="btn cursor-pointer">
      <Plus className="h-4 w-4" aria-hidden /> Add colour
      <input ref={input} type="color" className="sr-only" defaultValue="#E5352B" />
    </label>
  );
}
