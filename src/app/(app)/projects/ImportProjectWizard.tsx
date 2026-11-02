"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FolderOpen, Info, Undo2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { parsePhotoFileName, parseReport, type SourcePhotoFile, type SourceReport } from "@/lib/archisnapper/parse";
import { isArchiSnapperCsv, parseCsv, reportsFromCsv } from "@/lib/archisnapper/csv";
import { buildImportPlan, titleCase, type ImportPlan, type PlanPhoto } from "@/lib/archisnapper/plan";
import { readPdfText } from "@/lib/archisnapper/readPdf";
import { contactName } from "@/lib/domain";
import type { Contact, StatusDef } from "@/lib/types";

/*
 * Creating a project from an ArchiSnapper export: choose the export folder,
 * review what was found, map statuses, choose how to treat existing contacts,
 * then import (project first, then the photos, with progress). The import can
 * be undone afterwards.
 */

type Step = "choose" | "reading" | "review" | "statuses" | "contacts" | "importing" | "done";
type StatusChoice = { kind: "existing"; statusId: string } | { kind: "new"; label: string; color: string };
interface Preview {
  projectNameTaken: boolean;
  existing: Array<{ key: string; contact: Contact }>;
}
interface Targets {
  batchId: string;
  projectId: string;
  observations: Record<string, string>;
  reports: Record<number, string>;
}
interface ImportLog {
  counts: Record<string, number>;
  issues: ImportPlan["issues"];
}

const NEW_COLORS = ["#F5C26B", "#9EC5F2", "#C9A8E8", "#F2A0A0", "#9FD3A8", "#C3C9D1"];
const PARALLEL_UPLOADS = 3;

export function ImportProjectWizard({
  statuses,
  onClose,
  resume,
}: {
  statuses: StatusDef[];
  onClose: () => void;
  /** Continue an interrupted import: choose the same folder again and only missing photos are uploaded. */
  resume?: { batchId: string; projectId: string; projectName: string };
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("choose");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: "" });
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const filesRef = useRef<Map<string, File> | null>(null);
  const [name, setName] = useState("");
  /** Where the data came from, shown on the review step. */
  const [sourceNote, setSourceNote] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, StatusChoice>>({});
  const [contactMode, setContactMode] = useState<"keep" | "update">("keep");
  const [targets, setTargets] = useState<Targets | null>(null);
  const [log, setLog] = useState<ImportLog | null>(null);
  const [failures, setFailures] = useState<string[]>([]);
  const [undoing, setUndoing] = useState(false);
  // Set when the user cancels: reading stops, uploads stop, and anything created is removed.
  const cancelled = useRef(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const undo = (batchId: string) =>
    fetch(`/api/import/${batchId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo" }) });
  const cancel = () => {
    if (step === "importing") return setConfirmCancel(true);
    cancelled.current = true;
    onClose();
  };
  const sorted = useMemo(() => [...statuses].sort((a, b) => a.order - b.order), [statuses]);

  // Leaving the page mid-import would stop it: ask first.
  useEffect(() => {
    if (step !== "importing") return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step]);

  // ---- 1. Read the export in the browser (nothing is uploaded yet).
  async function read(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const all = [...list];
    const pdfs = all.filter((f) => /\.pdf$/i.test(f.name));
    const csvFile = all.find((f) => /\.csv$/i.test(f.name));
    const photos: SourcePhotoFile[] = [];
    const byPath = new Map<string, File>();
    for (const f of all) {
      const path = f.webkitRelativePath || f.name;
      const parsed = parsePhotoFileName(path);
      if (parsed) {
        photos.push(parsed);
        byPath.set(path, f);
      }
    }
    const records = csvFile ? parseCsv(await csvFile.text()) : [];
    const useCsv = isArchiSnapperCsv(records);
    if (!pdfs.length && !useCsv) {
      setError("No reports.csv or report PDFs were found in that folder. Choose the folder ArchiSnapper exported (it contains Reports and Pictures).");
      return;
    }
    setStep("reading");
    const printed: SourceReport[] = [];
    try {
      for (const [i, f] of pdfs.entries()) {
        if (cancelled.current) return;
        setProgress({ done: i, total: pdfs.length, label: `Reading ${f.name}` });
        printed.push(parseReport(await readPdfText(f)));
      }
    } catch {
      setError("A report PDF couldn't be read. Check that the folder is an ArchiSnapper export.");
      setStep("choose");
      return;
    }
    // The CSV is the better source (exact photo links, clean text); the PDFs add
    // attendees, status names and photo captions, which the CSV doesn't have.
    const reports = useCsv ? reportsFromCsv(records, printed) : printed;
    setSourceNote(
      useCsv
        ? pdfs.length
          ? `Read from ${csvFile!.name}, with attendees, status names and photo captions from ${pdfs.length} report PDF${pdfs.length === 1 ? "" : "s"}.`
          : `Read from ${csvFile!.name}. There are no report PDFs, so attendees and photo captions aren't imported.`
        : `Read from ${pdfs.length} report PDF${pdfs.length === 1 ? "" : "s"}. Without ArchiSnapper's reports.csv, photos are linked to observations by their captions.`,
    );
    const built = buildImportPlan(reports, photos);
    setPlan(built);
    setFiles(byPath);
    if (resume) {
      if (built.project.name !== resume.projectName && !window.confirm(`This folder is for “${built.project.name}”, not “${resume.projectName}”. Resume anyway?`)) {
        setStep("choose");
        return;
      }
      setName(resume.projectName);
      await resumeImportWith(built, byPath);
      return;
    }
    setName(built.project.name);
    // Statuses: same name as an existing one, or a new one.
    setStatusMap(
      Object.fromEntries(
        built.statuses.map((s, i) => {
          const match = sorted.find((x) => x.label.toLowerCase() === s.name.toLowerCase());
          return [s.name, match ? { kind: "existing", statusId: match.id } : { kind: "new", label: titleCase(s.name), color: NEW_COLORS[i % NEW_COLORS.length] }];
        }),
      ),
    );
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", projectName: built.project.name, emails: built.contacts.map((c) => c.email) }),
      });
      if (res.ok) setPreview((await res.json()) as Preview);
    } catch {
      // The preview only adds warnings; the import itself checks again.
    }
    setStep("review");
  }

  // ---- 2. Create the project, then upload the photos.
  async function runImport() {
    if (!plan) return;
    setStep("importing");
    setError(null);
    setProgress({ done: 0, total: plan.photos.length, label: "Creating the project…" });
    const map = Object.fromEntries(
      Object.entries(statusMap).map(([k, v]) => [k, v.kind === "existing" ? { statusId: v.statusId } : { label: v.label, color: v.color }]),
    );
    let t: Targets;
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", plan: { ...plan, project: { ...plan.project, name: name.trim() || plan.project.name } }, statusMap: map, contactMode }),
      });
      const body = (await res.json()) as Targets & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "The import failed. Nothing was saved.");
      t = body;
      setTargets(t);
      if (cancelled.current) {
        await undo(t.batchId);
        router.refresh();
        return;
      }
    } catch (e) {
      if (cancelled.current) return;
      setError(e instanceof Error ? e.message : "The import failed. Nothing was saved.");
      setStep("contacts");
      return;
    }

    await uploadAndFinish(t, plan.photos, plan);
  }

  /**
   * Uploads photos to their observations, three at a time. Each photo is
   * retried; if the connection or server drops, uploading pauses and keeps
   * retrying until it's back (or the import is cancelled). The server skips
   * photos it already has, so retrying never adds a photo twice.
   */
  async function uploadAndFinish(t: Targets, list: PlanPhoto[], p: ImportPlan) {
    const failed: string[] = [];
    let done = 0;
    let waiting = 0;
    const queue = [...list];
    const show = () =>
      setProgress({
        done,
        total: list.length,
        label: waiting ? `Connection lost: retrying… (${done} of ${list.length} photos added)` : `Adding photos (${done} of ${list.length})`,
      });
    const send = async (photo: PlanPhoto): Promise<string | null> => {
      const file = (filesRef.current ?? files).get(photo.path);
      const target = { observationId: t.observations[photo.number], reportId: t.reports[photo.sequence] };
      if (!file || !target.observationId || !target.reportId) return "the photo couldn't be matched to its observation";
      for (let attempt = 0; !cancelled.current; attempt++) {
        const form = new FormData();
        form.set("file", file, file.name);
        form.set("path", photo.path);
        form.set("observationId", target.observationId);
        form.set("reportId", target.reportId);
        form.set("caption", photo.caption);
        form.set("order", String(photo.order));
        let retryable: boolean;
        try {
          const res = await fetch(`/api/import/${t.batchId}`, { method: "POST", body: form });
          if (res.ok) return null;
          const message = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "the upload failed";
          // A problem with the photo itself (400) won't fix itself; server trouble might.
          if (res.status < 500 || attempt >= 4) return message;
          retryable = true;
        } catch {
          retryable = true; // no connection: keep trying until it's back
        }
        if (retryable) {
          waiting++;
          show();
          await new Promise((r) => setTimeout(r, Math.min(30_000, 2_000 * 2 ** Math.min(attempt, 4))));
          waiting--;
        }
      }
      return "cancelled";
    };
    const worker = async () => {
      for (let photo = queue.shift(); photo && !cancelled.current; photo = queue.shift()) {
        const failure = await send(photo);
        if (failure && failure !== "cancelled") failed.push(`${photo.path} (observation ${photo.number}, report ${photo.sequence}): ${failure}.`);
        done++;
        show();
      }
    };
    show();
    await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, worker));
    if (cancelled.current) {
      // Cancelling a new import removes it; cancelling a resumed one just stops.
      if (!resume) await undo(t.batchId);
      router.refresh();
      return;
    }
    setFailures(failed);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch(`/api/import/${t.batchId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finish", failures: failed }) });
        if (res.ok) {
          setLog((await res.json()) as ImportLog);
          break;
        }
      } catch {
        // retried below
      }
      if (attempt === 4) setLog({ counts: {}, issues: p.issues });
      await new Promise((r) => setTimeout(r, 3_000));
    }
    setStep("done");
    router.refresh();
  }

  // ---- Resuming: upload only the photos the import doesn't have yet.
  async function resumeImportWith(built: ImportPlan, byPath: Map<string, File>) {
    filesRef.current = byPath;
    await resumeImport(built);
  }
  async function resumeImport(built: ImportPlan) {
    if (!resume) return;
    setStep("importing");
    setProgress({ done: 0, total: built.photos.length, label: "Checking which photos are already imported…" });
    try {
      const [recRes, doneRes] = await Promise.all([fetch(`/api/import/${resume.batchId}`), fetch(`/api/import/${resume.batchId}?photos=1`)]);
      const record = (await recRes.json()) as { targets?: { observations: Record<string, string>; reports: Record<number, string> }; error?: string };
      const already = new Set(((await doneRes.json()) as { paths?: string[] }).paths ?? []);
      if (!recRes.ok || !record.targets) throw new Error(record.error ?? "This import can't be resumed.");
      const t: Targets = { batchId: resume.batchId, projectId: resume.projectId, ...record.targets };
      setTargets(t);
      const missing = built.photos.filter((ph) => !already.has(ph.path) && t.observations[ph.number]);
      await uploadAndFinish(t, missing, built);
    } catch (e) {
      setError(e instanceof Error ? e.message : "This import can't be resumed.");
      setStep("choose");
    }
  }

  const downloadLog = () => {
    if (!plan || !log) return;
    const lines = [
      `Kestro import from ArchiSnapper — ${name}`,
      `Batch ${targets?.batchId ?? ""}`,
      "",
      ...Object.entries(log.counts).map(([k, v]) => `${k}: ${v}`),
      `duplicate photo files skipped: ${plan.duplicateFiles}`,
      "",
      ...log.issues.map((i) => `${i.level === "warning" ? "WARNING" : "note"}: ${i.message}`),
      ...(plan.unmatchedFiles.length ? ["", "Photo files not imported:", ...plan.unmatchedFiles] : []),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `kestro-import-${targets?.batchId ?? "log"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const warnings = plan?.issues.filter((i) => i.level === "warning") ?? [];
  const notes = plan?.issues.filter((i) => i.level === "info") ?? [];
  const existingByKey = new Map(preview?.existing.map((e) => [e.key, e.contact]) ?? []);
  const newContacts = plan?.contacts.filter((c) => c.email && !existingByKey.has(c.key)) ?? [];
  const matchedContacts = plan?.contacts.filter((c) => existingByKey.has(c.key)) ?? [];
  // Kestro users are never changed by an import; only external contacts can be updated.
  const matchedUsers = matchedContacts.filter((c) => existingByKey.get(c.key)?.userEmail);
  const matchedExternal = matchedContacts.filter((c) => !existingByKey.get(c.key)?.userEmail);

  return (
    <div className="space-y-5">
      <Steps step={step} />
      <ConfirmDialog
        open={confirmCancel}
        title="Cancel the import?"
        confirmLabel="Cancel import"
        cancelLabel="Keep importing"
        danger
        onClose={() => setConfirmCancel(false)}
        onConfirm={async () => {
          cancelled.current = true;
          setProgress((p) => ({ ...p, label: "Cancelling and removing what was imported…" }));
          setConfirmCancel(false);
          // runImport removes the project once the uploads in progress stop.
          onClose();
          return null;
        }}
      >
        <p>
          {resume
            ? "Uploading stops. The photos added so far stay, and you can resume again later from the project's settings."
            : "The import stops, and the project and photos added so far are removed."}
        </p>
      </ConfirmDialog>
      {error && (
        <p className="rounded-md border border-danger bg-danger-subtle p-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {step === "choose" && (
        <div className="space-y-4">
          {resume ? (
            <p className="text-sm">
              Choose the same export folder you imported <span className="font-medium">{resume.projectName}</span> from. Only the photos
              that aren&apos;t in Kestro yet are uploaded.
            </p>
          ) : (
          <div className="space-y-2 text-sm">
            <p>
              To import from ArchiSnapper with maximum fidelity to your original data, you must perform two exports from ArchiSnapper via{" "}
              <span className="font-medium">Navigation &gt; More &gt; Export Data</span>:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Choose a service such as Google Drive or Dropbox. ArchiSnapper will create a folder containing PDF field reports and all
                images. This is the folder you should select for your Kestro import.
              </li>
              <li>
                Select the CSV option in ArchiSnapper to export your project information as tabular data. ArchiSnapper will email a CSV file
                attachment. Add that CSV to the project folder prior to importing to Kestro.
              </li>
            </ol>
          </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => input.current?.click()}>
              <FolderOpen className="h-4 w-4" aria-hidden /> Choose export folder
            </button>
            <button type="button" className="btn" onClick={cancel}>Cancel</button>
          </div>
          <input
            ref={input}
            type="file"
            hidden
            multiple
            // Folder selection (supported by all current desktop browsers).
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={(e) => void read(e.target.files)}
          />
        </div>
      )}

      {(step === "reading" || step === "importing") && (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm">{progress.label}</p>
          <div className="h-2 overflow-hidden rounded bg-surface-muted">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
          {step === "importing" && (
            <p className="text-xs text-text-muted">
              Keep this window open until the photos are done. If it&apos;s interrupted, you can resume from the project&apos;s settings.
            </p>
          )}
          <button type="button" className="btn" onClick={cancel}>Cancel import</button>
        </div>
      )}

      {step === "review" && plan && (
        <div className="space-y-4">
          {sourceNote && <p className="text-sm text-text-muted">{sourceNote}</p>}
          <div>
            <label className="label" htmlFor="import-name">Project name</label>
            <input id="import-name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            {preview?.projectNameTaken && name.trim() === plan.project.name && (
              <p className="mt-1 text-xs text-warning">A project with this name already exists. Importing again creates a second copy.</p>
            )}
          </div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Fact label="Field reports" value={plan.reports.length} />
            <Fact label="Observations" value={plan.observations.length} />
            <Fact label="Updates" value={plan.observations.reduce((n, o) => n + o.updates.length, 0)} />
            <Fact label="Photos to add" value={plan.photos.length} />
            <Fact label="Repeated photo files skipped" value={plan.duplicateFiles} />
            <Fact label="Contacts" value={plan.contacts.filter((c) => c.email).length} />
          </dl>
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Reports found</summary>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-text-muted">
                <tr className="border-b border-border">
                  <th className="px-3 py-1.5 font-medium">Report</th>
                  <th className="px-3 py-1.5 font-medium">Visit date</th>
                  <th className="px-3 py-1.5 font-medium">Observations</th>
                  <th className="px-3 py-1.5 font-medium">New observations</th>
                  <th className="px-3 py-1.5 font-medium">Updates</th>
                  <th className="px-3 py-1.5 font-medium">New photos</th>
                </tr>
              </thead>
              <tbody>
                {plan.reports.map((r) => (
                  <tr key={r.sequence} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5">{plan.project.reportPrefix}{r.sequence}</td>
                    <td className="px-3 py-1.5">{r.visitDate}</td>
                    <td className="px-3 py-1.5">{r.observations.length}</td>
                    <td className="px-3 py-1.5">{plan.observations.filter((o) => o.originSequence === r.sequence).length}</td>
                    <td className="px-3 py-1.5">{plan.observations.reduce((n, o) => n + o.updates.filter((u) => u.sequence === r.sequence).length, 0)}</td>
                    <td className="px-3 py-1.5">{plan.photos.filter((p) => p.sequence === r.sequence).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <Issues warnings={warnings} notes={notes} unmatched={plan.unmatchedFiles} />
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => setStep("statuses")}>Next: statuses</button>
            <button type="button" className="btn" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {step === "statuses" && plan && (
        <div className="space-y-4">
          <p className="text-sm">Choose what each status in the export becomes in this project. New statuses are added to this project only.</p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-text-muted">
              <tr className="border-b border-border">
                <th className="py-1.5 font-medium">In ArchiSnapper</th>
                <th className="py-1.5 font-medium">In Kestro</th>
              </tr>
            </thead>
            <tbody>
              {plan.statuses.map((s) => {
                const choice = statusMap[s.name];
                return (
                  <tr key={s.name} className="border-b border-border align-top last:border-0">
                    <td className="py-2 pr-3">
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-text-muted">{s.observations} observation{s.observations === 1 ? "" : "s"} end with this status</div>
                    </td>
                    <td className="space-y-2 py-2">
                      <select
                        className="input"
                        aria-label={`Kestro status for ${s.name}`}
                        value={choice?.kind === "existing" ? choice.statusId : "__new"}
                        onChange={(e) =>
                          setStatusMap({
                            ...statusMap,
                            [s.name]: e.target.value === "__new" ? { kind: "new", label: titleCase(s.name), color: NEW_COLORS[0] } : { kind: "existing", statusId: e.target.value },
                          })
                        }
                      >
                        {sorted.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                        <option value="__new">New status…</option>
                      </select>
                      {choice?.kind === "new" && (
                        <div className="flex items-center gap-2">
                          <input
                            className="input"
                            aria-label="New status name"
                            value={choice.label}
                            onChange={(e) => setStatusMap({ ...statusMap, [s.name]: { ...choice, label: e.target.value } })}
                          />
                          <input
                            type="color"
                            aria-label="New status colour"
                            className="h-8 w-10 shrink-0 cursor-pointer rounded border border-border"
                            value={choice.color}
                            onChange={(e) => setStatusMap({ ...statusMap, [s.name]: { ...choice, color: e.target.value.toUpperCase() } })}
                          />
                          <HexInput
                            value={choice.color}
                            label={`Hex colour for ${choice.label || "the new status"}`}
                            onChange={(color) => setStatusMap({ ...statusMap, [s.name]: { ...choice, color } })}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={Object.values(statusMap).some((c) => c.kind === "new" && !c.label.trim())}
              onClick={() => setStep("contacts")}
            >
              Next: contacts
            </button>
            <button type="button" className="btn" onClick={() => setStep("review")}>Back</button>
            <button type="button" className="btn" onClick={cancel}>Cancel</button>
          </div>
          <p className="text-xs text-text-muted">Statuses can be changed in the project&apos;s settings after it&apos;s created.</p>
        </div>
      )}

      {step === "contacts" && plan && (
        <div className="space-y-4">
          <p className="text-sm">
            {newContacts.length} new contact{newContacts.length === 1 ? "" : "s"} will be added. People are matched to existing contacts by email.
          </p>
          {newContacts.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border text-sm">
              {newContacts.map((c) => (
                <li key={c.key} className="px-3 py-2">
                  <span className="font-medium">{c.firstName} {c.lastName}</span>
                  <span className="text-text-muted"> · {[c.role, c.company, c.email, c.phone].filter(Boolean).join(" · ")}</span>
                </li>
              ))}
            </ul>
          )}
          {matchedUsers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm">{matchedUsers.length === 1 ? "This Kestro user was" : `These ${matchedUsers.length} Kestro users were`} found in the export:</p>
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {matchedUsers.map((c) => {
                  const k = existingByKey.get(c.key)!;
                  return (
                    <li key={c.key} className="px-3 py-2">
                      <span className="font-medium">{contactName(k) || k.email}</span>
                      <span className="text-text-muted"> · {k.email}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          {matchedExternal.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm">{matchedExternal.length} contact{matchedExternal.length === 1 ? "" : "s"} already {matchedExternal.length === 1 ? "exists" : "exist"} in Kestro:</p>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-text-muted">
                  <tr className="border-b border-border">
                    <th className="py-1.5 font-medium">In Kestro</th>
                    <th className="py-1.5 font-medium">In the export</th>
                  </tr>
                </thead>
                <tbody>
                  {matchedExternal.map((c) => {
                    const k = existingByKey.get(c.key)!;
                    return (
                      <tr key={c.key} className="border-b border-border last:border-0">
                        <td className="py-1.5 pr-3">{contactName(k)}<span className="text-text-muted"> · {[k.company, k.phone].filter(Boolean).join(" · ")}</span></td>
                        <td className="py-1.5">{c.firstName} {c.lastName}<span className="text-text-muted"> · {[c.company, c.phone].filter(Boolean).join(" · ")}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <fieldset className="space-y-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" name="contact-mode" className="accent-primary" checked={contactMode === "keep"} onChange={() => setContactMode("keep")} />
                  Keep existing contacts as they are, and only add new ones
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="contact-mode" className="accent-primary" checked={contactMode === "update"} onChange={() => setContactMode("update")} />
                  Update existing contacts with the details from the export
                </label>
              </fieldset>
            </div>
          )}
          <p className="text-xs text-text-muted">Each person is added to the project with the role shown in the reports, and listed as present or absent on each report.</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary" onClick={() => void runImport()}>Create project from import</button>
            <button type="button" className="btn" onClick={() => setStep("statuses")}>Back</button>
            <button type="button" className="btn" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}

      {step === "done" && plan && targets && (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="h-5 w-5 text-success" aria-hidden /> {name} was created.
          </p>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <Fact label="Field reports" value={log?.counts.reports ?? plan.reports.length} />
            <Fact label="Observations" value={log?.counts.observations ?? plan.observations.length} />
            <Fact label="Updates" value={log?.counts.updates ?? 0} />
            <Fact label="Status changes" value={log?.counts.statusEvents ?? 0} />
            <Fact label="Photos added" value={`${log?.counts.photosImported ?? 0} of ${plan.photos.length}`} />
            <Fact label="Contacts added / updated" value={`${log?.counts.contactsCreated ?? 0} / ${log?.counts.contactsUpdated ?? 0}`} />
          </dl>
          {failures.length > 0 && <p className="text-sm text-warning">{failures.length} photo{failures.length === 1 ? "" : "s"} couldn&apos;t be added; they&apos;re listed in the import log.</p>}
          <Issues warnings={(log?.issues ?? plan.issues).filter((i) => i.level === "warning")} notes={(log?.issues ?? plan.issues).filter((i) => i.level === "info")} unmatched={plan.unmatchedFiles} />
          <p className="text-xs text-text-muted">Import batch {targets.batchId}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => router.push(`/projects/${targets.projectId}/reports`)}>Open project</button>
            <button type="button" className="btn" onClick={downloadLog}>Download import log</button>
            <button type="button" className="btn btn-danger" onClick={() => setUndoing(true)}>
              <Undo2 className="h-4 w-4" aria-hidden /> Undo import
            </button>
            <button type="button" className="btn" onClick={onClose}>Close</button>
          </div>
          <ConfirmDialog
            open={undoing}
            title="Undo this import?"
            confirmLabel="Undo import"
            danger
            onClose={() => setUndoing(false)}
            onConfirm={async () => {
              const res = await fetch(`/api/import/${targets.batchId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "undo" }) });
              if (!res.ok) return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "The import couldn't be undone.";
              router.refresh();
              onClose();
              return null;
            }}
          >
            <p>
              <span className="font-medium">{name}</span> and its photos will be deleted. Contacts the import added are removed (unless another
              project uses them), and contacts it updated get their earlier details back.
            </p>
          </ConfirmDialog>
        </div>
      )}
    </div>
  );
}

function Steps({ step }: { step: Step }) {
  const steps: Array<[Step[], string]> = [
    [["choose", "reading"], "Choose export"],
    [["review"], "Review"],
    [["statuses"], "Statuses"],
    [["contacts"], "Contacts"],
    [["importing", "done"], "Import"],
  ];
  const current = steps.findIndex(([s]) => s.includes(step));
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {steps.map(([, label], i) => (
        <li key={label} className={i === current ? "font-semibold text-text" : i < current ? "text-text-muted" : "text-text-muted/70"}>
          {i + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-base font-semibold">{value}</dd>
    </div>
  );
}

function Issues({ warnings, notes, unmatched }: { warnings: ImportPlan["issues"]; notes: ImportPlan["issues"]; unmatched: string[] }) {
  if (!warnings.length && !notes.length) return null;
  return (
    <div className="space-y-2">
      {warnings.length > 0 && (
        <details className="rounded-md border border-warning/50 bg-warning/5" open>
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden /> {warnings.length} thing{warnings.length === 1 ? "" : "s"} to check
          </summary>
          <ul className="max-h-48 list-disc space-y-1 overflow-y-auto px-8 pb-3 text-sm">
            {warnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
          {unmatched.length > 0 && (
            <details className="px-6 pb-3 text-xs">
              <summary className="cursor-pointer text-text-muted">Photo files not imported</summary>
              <ul className="mt-1 max-h-32 overflow-y-auto font-mono">{unmatched.map((u) => <li key={u}>{u}</li>)}</ul>
            </details>
          )}
        </details>
      )}
      {notes.length > 0 && (
        <details className="rounded-md border border-border">
          <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium">
            <Info className="h-4 w-4 text-text-muted" aria-hidden /> {notes.length} note{notes.length === 1 ? "" : "s"} on how things were read
          </summary>
          <ul className="max-h-48 list-disc space-y-1 overflow-y-auto px-8 pb-3 text-sm">
            {notes.map((n, i) => <li key={i}>{n.message}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Hex code beside a colour swatch; applied once it's a valid #RRGGBB. */
function HexInput({ value, label, onChange }: { value: string; label: string; onChange: (hex: string) => void }) {
  const [text, setText] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setText(value);
  }
  return (
    <input
      aria-label={label}
      className="input w-28 shrink-0 font-mono text-xs"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toUpperCase());
      }}
      onBlur={() => setText(value)}
    />
  );
}
