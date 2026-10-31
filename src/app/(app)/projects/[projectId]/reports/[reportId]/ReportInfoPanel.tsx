"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Users, X } from "lucide-react";
import { updateReportInfoAction } from "@/app/actions";
import { useAutosave } from "@/components/autosave";
import { InlineDate, InlineSelect, InlineText, InlineTextarea, InlineTime } from "@/components/ui/InlineEdit";
import type { ReportView } from "@/server/services/reportView";
import { contactName } from "@/lib/domain";
import type { Attendee, Contact, SummaryOverride } from "@/lib/types";

/** Card with a header bar, as used down the field report page. */
export function Card({ title, titleFor, actions, children }: { title: string; titleFor?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {titleFor ? (
          <label htmlFor={titleFor} className="mr-auto text-sm font-semibold">{title}</label>
        ) : (
          <h2 className="mr-auto text-sm font-semibold">{title}</h2>
        )}
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/**
 * The report's own information, autosaved: details, who was present, ongoing
 * work. Contact details are read-only here; they're edited on the project's
 * Contacts page.
 */
export function ReportInfoPanel({ view, contacts }: { view: ReportView; contacts: Contact[] }) {
  const { report, project, settings } = view;
  const [info, setInfo] = useState({
    visitDate: report.visitDate,
    visitTime: report.visitTime,
    authorName: report.authorName,
    ongoingWork: report.ongoingWork,
    attendees: report.attendees,
    summaryOverride: report.summaryOverride,
  });
  const version = useRef(report.version);
  const { conflict } = useAutosave("report-info", info, async (v) => {
    const res = await updateReportInfoAction(project.id, report.id, v, version.current);
    if (res.ok) version.current = res.data;
    return res;
  });
  const set = <K extends keyof typeof info>(k: K, v: (typeof info)[K]) => setInfo((s) => ({ ...s, [k]: v }));
  const setAttendee = (id: string, patch: Partial<Attendee>) =>
    set("attendees", info.attendees.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const contactById = new Map(contacts.map((c) => [c.id, c]));
  const roleById = new Map(project.contacts.map((c) => [c.contactId, c.projectRole]));
  const unlisted = contacts.filter((c) => !info.attendees.some((a) => a.contactId === c.id));
  // Show current contact details; the stored copy covers attendees no longer on the project.
  const shown = (a: Attendee) => {
    const c = a.contactId ? contactById.get(a.contactId) : undefined;
    return { name: c ? contactName(c) : a.name, company: c ? c.company : a.company, role: a.contactId ? (roleById.get(a.contactId) ?? "") : "" };
  };

  return (
    <>
      {conflict && (
        <div role="alert" className="rounded-md border border-danger bg-danger-subtle p-3 text-sm text-danger">
          Someone else changed this report. Your latest edits were not saved.{" "}
          <button className="underline" onClick={() => window.location.reload()}>Reload</button>
        </div>
      )}

      <Card title="Report details">
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="label" htmlFor="ri-date">Visit date</label>
            <InlineDate id="ri-date" value={info.visitDate} onChange={(v) => set("visitDate", v)} />
          </div>
          <div>
            <label className="label" htmlFor="ri-time">Time</label>
            <InlineTime id="ri-time" value={info.visitTime} onChange={(v) => set("visitTime", v)} />
          </div>
          <div>
            <label className="label" htmlFor="ri-author">Author</label>
            <InlineText id="ri-author" value={info.authorName} onChange={(v) => set("authorName", v)} />
          </div>
          <div>
            <label className="label" htmlFor="ri-summary">Observation summary in PDF</label>
            <InlineSelect
              id="ri-summary"
              value={info.summaryOverride}
              onChange={(v) => set("summaryOverride", v as SummaryOverride)}
              options={[
                { value: "default", label: `Organization default (${settings.showSummaryDefault ? "show" : "hide"})` },
                { value: "show", label: "Show" },
                { value: "hide", label: "Hide" },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card title="Contacts present">
        {info.attendees.length === 0 ? (
          <p className="text-sm text-text-muted">No contacts listed for this visit.</p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col style={{ width: 80 }} />
              <col />
              <col />
              <col />
              <col style={{ width: 48 }} />
            </colgroup>
            <thead className="text-left text-xs font-semibold text-text-muted">
              <tr className="border-b-2 border-border">
                <th className="px-3 py-2.5">Present</th>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Role</th>
                <th aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {info.attendees.map((a) => {
                const s = shown(a);
                return (
                  <tr key={a.id} className="border-b border-border">
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        aria-label={`${s.name} present`}
                        checked={a.present}
                        onChange={(e) => setAttendee(a.id, { present: e.target.checked })}
                      />
                    </td>
                    <td className="truncate px-3 py-3 font-medium">{s.name}</td>
                    <td className="truncate px-3 py-3">{s.company}</td>
                    <td className="truncate px-3 py-3 text-text-muted">{s.role}</td>
                    <td className="px-1 py-2 text-right">
                      <button
                        type="button"
                        className="rounded p-1 text-text-muted hover:bg-surface-muted hover:text-danger"
                        aria-label={`Remove ${s.name} from this report`}
                        title="Remove from this report"
                        onClick={() => set("attendees", info.attendees.filter((x) => x.id !== a.id))}
                      >
                        <X className="h-4 w-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {unlisted.length > 0 && (
            <>
              <label className="sr-only" htmlFor="add-attendee">Add a project contact to this report</label>
              <select
                id="add-attendee"
                className="input w-64"
                value=""
                onChange={(e) => {
                  const c = contactById.get(e.target.value);
                  if (!c) return;
                  set("attendees", [...info.attendees, { id: crypto.randomUUID(), contactId: c.id, name: contactName(c), company: c.company, present: true }]);
                }}
              >
                <option value="">Add a project contact…</option>
                {unlisted.map((c) => (
                  <option key={c.id} value={c.id}>{contactName(c)}{c.company ? ` — ${c.company}` : ""}</option>
                ))}
              </select>
            </>
          )}
          <Link className="btn" href={`/projects/${project.id}/contacts`}>
            <Users className="h-4 w-4" aria-hidden /> Manage project contacts
          </Link>
        </div>
      </Card>

      <Card title="Ongoing work" titleFor="ri-ongoing">
        <InlineTextarea
          id="ri-ongoing"
          value={info.ongoingWork}
          onChange={(v) => set("ongoingWork", v)}
          placeholder="Describe the work in progress at this visit"
          minHeight="min-h-36"
        />
      </Card>
    </>
  );
}
