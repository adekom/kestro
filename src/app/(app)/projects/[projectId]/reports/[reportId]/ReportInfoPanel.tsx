"use client";

import { useRef, useState } from "react";
import { updateReportInfoAction } from "@/app/actions";
import { useAutosave } from "@/components/autosave";
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

/** The report's own information, autosaved: details, attendance, ongoing work. */
export function ReportInfoPanel({
  view,
  contacts,
  previousOngoingWork,
}: {
  view: ReportView;
  contacts: Contact[];
  previousOngoingWork: string;
}) {
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
  const setAttendee = (i: number, patch: Partial<Attendee>) =>
    set("attendees", info.attendees.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const unlisted = contacts.filter((c) => !info.attendees.some((a) => a.contactId === c.id));

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
          <input id="ri-date" type="date" className="input" value={info.visitDate} onChange={(e) => e.target.value && set("visitDate", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ri-time">Time</label>
          <input id="ri-time" type="time" className="input" value={info.visitTime} onChange={(e) => set("visitTime", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ri-author">Author</label>
          <input id="ri-author" className="input" value={info.authorName} onChange={(e) => set("authorName", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="ri-summary">Observation summary in PDF</label>
          <select id="ri-summary" className="input" value={info.summaryOverride} onChange={(e) => set("summaryOverride", e.target.value as SummaryOverride)}>
            <option value="default">Organization default ({settings.showSummaryDefault ? "show" : "hide"})</option>
            <option value="show">Show</option>
            <option value="hide">Hide</option>
          </select>
        </div>
        </div>
      </Card>

      <Card title="Contacts present">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-muted">
            <tr>
              <th className="py-1 font-medium">Name</th>
              <th className="py-1 font-medium">Company</th>
              <th className="py-1 font-medium">Present</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {info.attendees.map((a, i) => (
              <tr key={a.id} className="border-t border-border">
                <td className="py-1 pr-2">
                  <input className="input" aria-label="Attendee name" value={a.name} onChange={(e) => setAttendee(i, { name: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <input className="input" aria-label="Attendee company" value={a.company} onChange={(e) => setAttendee(i, { company: e.target.value })} />
                </td>
                <td className="py-1">
                  <input type="checkbox" className="accent-primary" aria-label={`${a.name} present`} checked={a.present} onChange={(e) => setAttendee(i, { present: e.target.checked })} />
                </td>
                <td className="py-1 text-right">
                  <button type="button" className="link text-xs" onClick={() => set("attendees", info.attendees.filter((_, j) => j !== i))}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap gap-2">
          {unlisted.map((c) => (
            <button
              key={c.id}
              type="button"
              className="btn"
              onClick={() => set("attendees", [...info.attendees, { id: crypto.randomUUID(), contactId: c.id, name: contactName(c), company: c.company, present: true }])}
            >
              + {contactName(c)}
            </button>
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => set("attendees", [...info.attendees, { id: crypto.randomUUID(), contactId: null, name: "", company: "", present: true }])}
          >
            + Other attendee
          </button>
        </div>
      </Card>

      <Card title="Ongoing work" titleFor="ri-ongoing">
        <div className="space-y-2">
        {previousOngoingWork && (
          <details className="rounded-md bg-surface-muted p-2 text-sm">
            <summary className="cursor-pointer text-text-muted">Previous report’s ongoing work (review before reusing)</summary>
            <p className="mt-2 whitespace-pre-wrap">{previousOngoingWork}</p>
            <button type="button" className="btn mt-2" onClick={() => set("ongoingWork", info.ongoingWork ? `${info.ongoingWork}\n\n${previousOngoingWork}` : previousOngoingWork)}>
              Insert into this report
            </button>
          </details>
        )}
        <textarea id="ri-ongoing" className="input min-h-36" value={info.ongoingWork} onChange={(e) => set("ongoingWork", e.target.value)} />
        </div>
      </Card>
    </>
  );
}
