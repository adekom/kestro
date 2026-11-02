// Combines parsed ArchiSnapper reports and photo file names into one import
// plan: a single project with its reports, observations (with the report they
// were created in, their dated updates and their status in each report),
// attendees, and the photos to upload. Anything that can't be worked out is
// listed as an issue rather than guessed.

import { slugify, type SourcePhotoFile, type SourceReport } from "./parse";

export interface PlanIssue {
  level: "warning" | "info";
  message: string;
}

export interface PlanContact {
  /** Lower-cased email (or "name:<name>" when there is no email). */
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  /** Role as last printed. */
  role: string;
}

export interface PlanReport {
  sequence: number;
  visitDate: string;
  visitTime: string;
  ongoingWork: string;
  attendees: Array<{ contactKey: string; present: boolean }>;
  /** Observation numbers in the order printed. */
  observations: string[];
}

export interface PlanObservation {
  number: string;
  /** Report it was created in, and its number there. */
  originSequence: number;
  localSeq: number;
  title: string;
  description: string;
  group: string | null;
  originalDate: string;
  /** Status as printed in each report that includes it. */
  statuses: Array<{ sequence: number; status: string }>;
  /** Dated updates, each in the report where it first appeared. */
  updates: Array<{ sequence: number; date: string; text: string }>;
}

export interface PlanPhoto {
  /** Path of the file within the export. */
  path: string;
  number: string;
  /** Report where the photo was first shown (it was added in that visit). */
  sequence: number;
  caption: string;
  /** Order within the observation. */
  order: number;
}

export interface ImportPlan {
  project: { name: string; address: string; reportPrefix: string };
  groups: string[];
  /** Status names as written in the export, with how many observations end with each. */
  statuses: Array<{ name: string; observations: number }>;
  reports: PlanReport[];
  observations: PlanObservation[];
  contacts: PlanContact[];
  photos: PlanPhoto[];
  /** Photo files skipped because they're copies of a photo already shown in an earlier report. */
  duplicateFiles: number;
  /** Photo files that couldn't be matched to an observation. */
  unmatchedFiles: string[];
  issues: PlanIssue[];
}

/** "LEVEL 0" → "Level 0", "EXTERIOR" → "Exterior". */
export const titleCase = (s: string) => s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "5/19 louvers" → "louvers": Kestro shows the photo's date separately. */
export const captionText = (c: string) => c.replace(/^\d{1,2}\/\d{1,2}(\/\d{2,4})?\s+/, "").trim();

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

function mostCommon(values: string[]): string | null {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/**
 * Lines up two photo lists by caption, in order (longest common sequence),
 * where an empty caption matches any. Returns current index → previous index.
 */
export function alignPhotos(prev: string[], cur: string[]): Map<number, number> {
  const same = (a: string, b: string) => !a || !b || a === b;
  const L = Array.from({ length: prev.length + 1 }, () => new Array<number>(cur.length + 1).fill(0));
  for (let i = prev.length - 1; i >= 0; i--)
    for (let j = cur.length - 1; j >= 0; j--) L[i][j] = same(prev[i], cur[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = new Map<number, number>();
  for (let i = 0, j = 0; i < prev.length && j < cur.length; ) {
    if (same(prev[i], cur[j]) && L[i][j] === L[i + 1][j + 1] + 1) out.set(j++, i++);
    else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  return out;
}

/**
 * Whether a file name's caption is this caption. File names drop punctuation
 * (so may end in "-") and cut long captions short.
 */
export function sameCaption(fileSlug: string, captionSlug: string): boolean {
  const f = fileSlug.replace(/^-+|-+$/g, "");
  return f === captionSlug || (f.length >= 30 && captionSlug.startsWith(f));
}

export function buildImportPlan(source: SourceReport[], files: SourcePhotoFile[]): ImportPlan {
  const issues: PlanIssue[] = [];
  const reports = [...source].filter((r) => Number.isFinite(r.sequence)).sort((a, b) => a.sequence - b.sequence);
  for (const r of source) for (const w of r.warnings) issues.push({ level: "warning", message: `Report ${r.sequence}: ${w}` });
  const seqs = reports.map((r) => r.sequence);
  seqs.forEach((s, i) => {
    if (s !== i + 1) issues.push({ level: "warning", message: `Report ${i + 1} is missing from the export (found ${seqs.join(", ")}).` });
  });
  const latest = reports.at(-1);

  // ---- Visit dates. The printed time can fall after midnight in another time
  // zone (e.g. "March 24 03:20 AM" for a March 23 visit), so prefer the date
  // written on that visit's own observations and updates when they agree.
  const visitDate = new Map<number, string>();
  for (const r of reports) {
    const prev = reports.find((x) => x.sequence === r.sequence - 1);
    const shownBefore = new Set(prev?.observations.flatMap((o) => o.updates.map((u) => `${o.number}|${u.date}`)) ?? []);
    const own = r.observations.filter((o) => Number(o.number.split(".")[0]) === r.sequence).flatMap((o) => (o.originalDate ? [o.originalDate] : []));
    const newUpdates = r.observations.flatMap((o) => o.updates.filter((u) => !shownBefore.has(`${o.number}|${u.date}`)).map((u) => u.date));
    const evidence = mostCommon([...own, ...newUpdates]);
    const date = evidence && r.headerDate && dayDiff(evidence, r.headerDate) <= 1 ? evidence : r.headerDate || evidence || "";
    if (date !== r.headerDate) issues.push({ level: "info", message: `Report ${r.sequence}: visit date taken as ${date} (the header says ${r.headerDate || "nothing"}), from the dates written on its observations and updates.` });
    visitDate.set(r.sequence, date);
  }

  // ---- Groups, in order of first appearance.
  const groups: string[] = [];
  for (const r of reports) for (const o of r.observations) if (o.group && !groups.includes(titleCase(o.group))) groups.push(titleCase(o.group));

  // ---- Contacts and attendance.
  const contacts = new Map<string, PlanContact>();
  const planReports: PlanReport[] = reports.map((r) => ({
    sequence: r.sequence,
    visitDate: visitDate.get(r.sequence) ?? r.headerDate,
    visitTime: r.headerTime,
    ongoingWork: r.ongoingWork,
    observations: r.observations.map((o) => o.number),
    attendees: r.attendees.map((a) => {
      const key = a.email ? a.email.toLowerCase() : `name:${a.name.toLowerCase()}`;
      const [firstName, ...rest] = a.name.split(/\s+/);
      contacts.set(key, { key, firstName: firstName ?? "", lastName: rest.join(" "), email: a.email, phone: a.phone, company: a.company, role: a.role });
      return { contactKey: key, present: a.present };
    }),
  }));
  for (const c of contacts.values()) {
    if (!c.email) issues.push({ level: "warning", message: `${c.firstName} ${c.lastName} has no email, so they're listed on reports by name only (not as a contact).` });
  }

  // ---- Observations.
  const byNumber = new Map<string, PlanObservation>();
  // Updates already taken for each observation, by date and position on that
  // date, with the full text last printed for each.
  const updatesByKey = new Map<string, Map<string, { update: PlanObservation["updates"][number]; printed: string }>>();
  for (const r of reports) {
    for (const o of r.observations) {
      const [originSequence, localSeq] = o.number.split(".").map(Number);
      let p = byNumber.get(o.number);
      if (!p) {
        p = {
          number: o.number,
          originSequence,
          localSeq,
          title: o.title,
          description: o.description,
          group: o.group ? titleCase(o.group) : null,
          originalDate: o.originalDate ?? "",
          statuses: [],
          updates: [],
        };
        byNumber.set(o.number, p);
        updatesByKey.set(o.number, new Map());
        if (originSequence !== r.sequence) {
          issues.push({ level: "warning", message: `Observation ${o.number} first appears in report ${r.sequence}, not report ${originSequence}; it's treated as created in report ${r.sequence <= originSequence ? r.sequence : originSequence}.` });
        }
      }
      // The latest report has the current title, description and group.
      if (o.title) p.title = o.title;
      if (o.description) p.description = o.description;
      if (o.group) p.group = titleCase(o.group);
      if (!p.originalDate && o.originalDate) p.originalDate = o.originalDate;
      p.statuses.push({ sequence: r.sequence, status: o.status });
      // Each report reprints earlier updates; keep each in the report where it first appeared
      // (the latest wording wins, in case it was edited later).
      const taken = updatesByKey.get(o.number)!;
      const perDate = new Map<string, number>();
      for (const u of o.updates) {
        const n = perDate.get(u.date) ?? 0;
        perDate.set(u.date, n + 1);
        const key = u.date ? `${u.date}#${n}` : `undated:${u.text}`;
        const existing = taken.get(key);
        if (!existing) {
          const added = { sequence: r.sequence, date: u.date || (visitDate.get(r.sequence) ?? ""), text: u.text };
          p.updates.push(added);
          taken.set(key, { update: added, printed: u.text });
        } else if (u.text !== existing.printed) {
          if (u.text.startsWith(existing.printed)) {
            // Text added to an earlier update is news from this visit.
            const extra = u.text.slice(existing.printed.length).trim();
            if (extra) p.updates.push({ sequence: r.sequence, date: visitDate.get(r.sequence) ?? u.date, text: extra });
            issues.push({ level: "info", message: `Observation ${o.number}: text added in report ${r.sequence} to the update dated ${u.date} is imported as an update in report ${r.sequence}.` });
          } else {
            existing.update.text = u.text;
            issues.push({ level: "info", message: `Observation ${o.number}: the update dated ${u.date} was reworded in report ${r.sequence}; Kestro keeps the latest wording for every report.` });
          }
          existing.printed = u.text;
        }
      }
    }
  }
  for (const p of byNumber.values()) {
    if (!reports.some((r) => r.sequence === p.originSequence)) {
      p.originSequence = p.statuses[0].sequence;
      issues.push({ level: "warning", message: `Observation ${p.number}: report ${p.number.split(".")[0]} isn't in the export, so it's treated as created in report ${p.originSequence}.` });
    }
    if (!p.originalDate) {
      p.originalDate = visitDate.get(p.originSequence) ?? "";
      issues.push({ level: "info", message: `Observation ${p.number}: no date opened is printed; using report ${p.originSequence}'s visit date.` });
    }
    // Kestro keeps the creating visit's record in the description, not as an update.
    const sameVisit = p.updates.filter((u) => u.sequence === p.originSequence);
    if (sameVisit.length) {
      p.description = [p.description, ...sameVisit.map((u) => u.text)].filter(Boolean).join("\n\n");
      p.updates = p.updates.filter((u) => u.sequence !== p.originSequence);
      issues.push({ level: "info", message: `Observation ${p.number}: ${sameVisit.length === 1 ? "an update" : `${sameVisit.length} updates`} written in the report where it was created ${sameVisit.length === 1 ? "is" : "are"} added to its description.` });
    }
    for (const u of p.updates) {
      const vd = visitDate.get(u.sequence);
      if (vd && dayDiff(vd, u.date) > 1) issues.push({ level: "info", message: `Observation ${p.number}: the update dated ${u.date} first appears in report ${u.sequence} (visit ${vd}).` });
    }
  }
  issues.push({
    level: "info",
    message: "Status history is taken from each report's printed status. ArchiSnapper exports don't record the day a status changed, so changes are dated to the report where they first show.",
  });

  // ---- Photos. Each report's export includes every photo shown in it, so
  // later reports repeat earlier photos as new files without the observation
  // number. Files are matched to the captions printed under each observation
  // (same report, group and caption); each photo is uploaded once, from the
  // report where it first appears.
  const filesByReport = new Map<number, SourcePhotoFile[]>();
  for (const f of [...files].sort((a, b) => a.timestamp.localeCompare(b.timestamp))) filesByReport.set(f.report, [...(filesByReport.get(f.report) ?? []), f]);
  const used = new Set<string>();
  const photos: PlanPhoto[] = [];
  const photoKeys = new Set<string>();
  let duplicateFiles = 0;
  const unmatchedCaptions: string[] = [];
  const fileById = new Map(files.map((f) => [f.id, f]));
  // Photos shown with each observation in the previous report (CSV exports).
  const shownList = new Map<string, Array<{ slug: string; photo: PlanPhoto }>>();
  for (const r of reports) {
    const pool = filesByReport.get(r.sequence) ?? [];
    for (const o of r.observations) {
      const groupSlug = o.group ? slugify(o.group) : "";
      const occurrences = new Map<string, number>();
      const matched: Array<{ file: SourcePhotoFile; caption: string }> = [];
      if (o.photoIds) {
        // The CSV says exactly which files are this observation's; captions come from the PDF when printed.
        const captions = [...o.captions];
        for (const id of o.photoIds) {
          const file = fileById.get(id);
          if (!file) {
            unmatchedCaptions.push(`Report ${r.sequence}, observation ${o.number}: picture ${id} is listed in the CSV but its file isn't in the export.`);
            continue;
          }
          used.add(file.path);
          const i = captions.findIndex((c) => sameCaption(file.captionSlug, slugify(c)));
          const caption = i >= 0 ? captions.splice(i, 1)[0] : file.captionSlug.replace(/-+/g, " ").trim();
          matched.push({ file, caption });
        }
      }
      for (const caption of o.photoIds ? [] : o.captions) {
        const slug = slugify(caption);
        const fits = (f: SourcePhotoFile, sameGroup: boolean) =>
          !used.has(f.path) && sameCaption(f.captionSlug, slug) && (f.number === null || f.number === o.number) && (!sameGroup || f.groupSlug === groupSlug);
        const file = pool.find((f) => fits(f, true)) ?? pool.find((f) => fits(f, false));
        if (!file) {
          unmatchedCaptions.push(`Report ${r.sequence}, observation ${o.number}: no photo file for “${caption}”.`);
          continue;
        }
        used.add(file.path);
        matched.push({ file, caption });
      }
      // Photos without a caption have no printed caption to match; numbered files still say where they belong.
      if (!o.photoIds) for (const f of pool) if (!used.has(f.path) && f.number === o.number && !f.captionSlug) {
        used.add(f.path);
        matched.push({ file: f, caption: "" });
      }
      if (o.photoIds) {
        // Lists only grow, except when a photo is removed or captioned later: match in order,
        // treating a missing caption as matching any, so a photo is uploaded once.
        const prev = shownList.get(o.number) ?? [];
        const cur = matched.map((m) => ({ ...m, slug: m.file.captionSlug.replace(/^-+|-+$/g, "") }));
        const pairs = alignPhotos(prev.map((p) => p.slug), cur.map((c) => c.slug));
        const next: Array<{ slug: string; photo: PlanPhoto }> = [];
        cur.forEach((c, j) => {
          const i = pairs.get(j);
          if (i !== undefined) {
            duplicateFiles++;
            const photo = prev[i].photo;
            if (!photo.caption && c.caption) photo.caption = captionText(c.caption);
            next.push({ slug: c.slug || prev[i].slug, photo });
          } else {
            const photo: PlanPhoto = { path: c.file.path, number: o.number, sequence: r.sequence, caption: captionText(c.caption), order: 0 };
            photos.push(photo);
            next.push({ slug: c.slug, photo });
          }
        });
        const removed = prev.length - pairs.size;
        if (removed > 0) {
          issues.push({ level: "info", message: `Observation ${o.number}: ${removed === 1 ? "a photo was" : `${removed} photos were`} removed in report ${r.sequence}. Kestro keeps ${removed === 1 ? "it" : "them"} on the observation, so ${removed === 1 ? "it shows" : "they show"} in later reports too.` });
        }
        shownList.set(o.number, next);
        continue;
      }
      for (const { file, caption } of matched) {
        const slug = slugify(caption);
        const n = occurrences.get(slug) ?? 0;
        occurrences.set(slug, n + 1);
        const key = `${o.number}|${slug}|${n}`;
        if (photoKeys.has(key)) {
          duplicateFiles++;
          continue;
        }
        photoKeys.add(key);
        photos.push({ path: file.path, number: o.number, sequence: r.sequence, caption: captionText(caption), order: 0 });
      }

    }
  }
  // Order within each observation: as first shown.
  const orderBy = new Map<string, number>();
  for (const p of photos) {
    p.order = orderBy.get(p.number) ?? 0;
    orderBy.set(p.number, p.order + 1);
  }
  const unmatchedFiles = files.filter((f) => !used.has(f.path)).map((f) => f.path);
  for (const m of unmatchedCaptions) issues.push({ level: "warning", message: m });
  if (unmatchedFiles.length) {
    issues.push({ level: "warning", message: `${unmatchedFiles.length} photo file${unmatchedFiles.length === 1 ? "" : "s"} couldn't be matched to an observation and won't be imported.` });
  }

  // ---- Statuses, by how many observations end with each.
  const finalStatus = new Map<string, number>();
  for (const p of byNumber.values()) {
    const s = p.statuses.at(-1)!.status;
    finalStatus.set(s, (finalStatus.get(s) ?? 0) + 1);
  }
  const statuses = [...new Set([...byNumber.values()].flatMap((p) => p.statuses.map((s) => s.status)))].map((name) => ({ name, observations: finalStatus.get(name) ?? 0 }));

  return {
    project: {
      name: latest?.projectName || latest?.title.replace(/\s+-\s+.*$/, "") || "Imported project",
      address: latest?.address ?? "",
      reportPrefix: (latest?.title.match(/-\s+(.*?)\s*\d+\s*$/)?.[1] ?? "Field Report").trim() + " ",
    },
    groups,
    statuses,
    reports: planReports,
    observations: [...byNumber.values()].sort((a, b) => a.originSequence - b.originSequence || a.localSeq - b.localSeq),
    contacts: [...contacts.values()],
    photos,
    duplicateFiles,
    unmatchedFiles,
    issues,
  };
}
