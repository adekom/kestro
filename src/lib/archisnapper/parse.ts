// Reads ArchiSnapper exports: the text of each report PDF (positioned text
// items, as pdf.js returns them) and the names of the exported photo files.
//
// The export has no data file, so everything comes from the printed report.
// Each report has a details section (status, number, title, date opened,
// description, dated updates, photo captions) and an "Observation summary"
// table (group, status, number, title), which is the more reliable source for
// those four fields.

export interface TextItem {
  page: number;
  /** PDF coordinates: x from the left, y from the bottom of the page. */
  x: number;
  y: number;
  /** Font size in points. */
  size: number;
  text: string;
}

export interface SourceAttendee {
  role: string;
  company: string;
  name: string;
  phone: string;
  email: string;
  present: boolean;
}

export interface SourceUpdate {
  /** The date written on the update (YYYY-MM-DD); empty when none was written. */
  date: string;
  text: string;
}

export interface SourceObservation {
  /** As printed, e.g. "5.7": the report it was created in, then its number there. */
  number: string;
  status: string;
  title: string;
  group: string | null;
  /** Date it was opened (YYYY-MM-DD), when printed. */
  originalDate: string | null;
  description: string;
  updates: SourceUpdate[];
  /** Captions under its photos in this report, in order (as printed, including any leading date). */
  captions: string[];
  /**
   * ArchiSnapper picture IDs listed for it in this report (from the CSV export),
   * in order. When given, they say exactly which photo files belong to it.
   */
  photoIds?: string[];
}

export interface SourceReport {
  sequence: number;
  /** First line of the report, e.g. "800 Maynard Ave S - Field Report 17". */
  title: string;
  projectName: string;
  address: string;
  /** Date and time printed in the header. */
  headerDate: string;
  headerTime: string;
  ongoingWork: string;
  attendees: SourceAttendee[];
  /** In the order printed. */
  observations: SourceObservation[];
  disclaimer: string;
  /** Problems found while reading this report. */
  warnings: string[];
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const NUMBER = /^\d+\.\d+$/;
const LONG_DATE = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})$/;
/** "Update 07/28/26:", and the looser forms typed by hand ("Update 6/16/26:", "Updated 06/30/2026:"). */
const UPDATE = /^Updated? (\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}):\s*/i;
/** The same with the date first: "12/2/25 Update:". */
const UPDATE_DATE_FIRST = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4}) Updated?:\s*/i;
/** "07/28/26" style parts → "2026-07-28". */
const updateDate = (m: RegExpMatchArray) => `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(m[1])}-${pad(m[2])}`;

/** An update's date and text, if the text starts like an update. */
export function matchUpdate(text: string): { date: string; text: string } | null {
  const t = text.trim();
  const m = t.match(UPDATE) ?? t.match(UPDATE_DATE_FIRST);
  return m ? { date: updateDate(m), text: t.slice(m[0].length).trim() } : null;
}
const HEADING_SIZE = 11;
const FOOTER_Y = 40;
/** Text items closer than this (points) vertically are on the same line. */
const SAME_LINE = 2;

const pad = (n: number | string) => String(n).padStart(2, "0");

/** "July 28, 2026" → "2026-07-28". */
export function parseLongDate(text: string): string | null {
  const m = text.trim().match(LONG_DATE);
  if (!m) return null;
  return `${m[3]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${pad(m[2])}`;
}

/** "07:45 PM" → "19:45". */
export function parseTime(text: string): string {
  const m = text.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return "";
  let h = Number(m[1]) % 12;
  if (m[3].toUpperCase() === "PM") h += 12;
  return `${pad(h)}:${m[2]}`;
}

/** Reading order: page by page, top to bottom, left to right. */
const before = (a: TextItem, b: TextItem) => a.page - b.page || b.y - a.y || a.x - b.x;

/** Groups items into lines (same page and baseline), each sorted left to right. */
function lines(items: TextItem[]): TextItem[][] {
  const out: TextItem[][] = [];
  for (const it of [...items].sort(before)) {
    const last = out.at(-1);
    if (last && last[0].page === it.page && Math.abs(last[0].y - it.y) <= SAME_LINE) last.push(it);
    else out.push([it]);
  }
  return out.map((l) => l.sort((a, b) => a.x - b.x));
}

/**
 * Joins wrapped lines of one column into text. A larger gap than usual
 * between lines starts a new paragraph.
 */
function joinLines(items: TextItem[]): string {
  const ls = lines(items);
  let text = "";
  ls.forEach((l, i) => {
    const s = l.map((x) => x.text).join(" ").trim();
    if (i === 0) text = s;
    else {
      const prev = ls[i - 1][0];
      const gap = prev.page === l[0].page ? prev.y - l[0].y : 0;
      text += gap > l[0].size * 1.8 ? `\n${s}` : ` ${s}`;
    }
  });
  return text.trim();
}

const isHeading = (it: TextItem) => it.size >= HEADING_SIZE;
/** Text in capitals (status words, group headings such as "LEVEL 2"). */
const isStatusWord = (s: string) => /^[A-Z0-9][A-Z0-9 &/-]*$/.test(s.trim()) && /[A-Z]/.test(s);

/** Splits the report into its titled sections (Ongoing Work, Attendees, Observations, …). */
function sections(items: TextItem[]): Map<string, TextItem[]> {
  const out = new Map<string, TextItem[]>();
  let current = "_header";
  for (const it of [...items].filter((i) => i.y > FOOTER_Y).sort(before)) {
    if (isHeading(it) && !(it.page === 1 && out.size === 0)) {
      current = it.text.trim().toLowerCase();
      out.set(current, []);
      continue;
    }
    if (!out.has(current)) out.set(current, []);
    out.get(current)!.push(it);
  }
  return out;
}

export function parseReport(items: TextItem[]): SourceReport {
  const warnings: string[] = [];
  const page1 = items.filter((i) => i.page === 1).sort(before);
  const titleItem = page1.find(isHeading);
  const s = sections(items);

  // Header: project name, address lines, report number, date.
  const header = (s.get("_header") ?? []).filter((i) => !isHeading(i));
  const headerLines = lines(header).map((l) => l.map((x) => x.text).join(" ").trim());
  const numberLine = headerLines.find((l) => l.startsWith("Report number:")) ?? "";
  const dateLine = headerLines.find((l) => l.startsWith("Date:")) ?? "";
  const infoLines = headerLines.filter((l) => !l.startsWith("Report number:") && !l.startsWith("Date:"));
  const sequence = Number(numberLine.match(/-(\d+)\s*$/)?.[1] ?? titleItem?.text.match(/(\d+)\s*$/)?.[1] ?? NaN);
  if (!Number.isFinite(sequence)) warnings.push("The report number couldn't be read.");
  const dm = dateLine.replace(/^Date:\s*/, "").match(/^(.+?\d{4})\s+(\d{1,2}:\d{2}\s*[AP]M)?/i);
  const headerDate = dm ? (parseLongDate(dm[1]) ?? "") : "";
  if (!headerDate) warnings.push("The report date couldn't be read.");

  const ongoingWork = joinLines(s.get("ongoing work") ?? []);
  const attendees = parseAttendees(s.get("attendees") ?? [], warnings);
  const details = parseDetails(s.get("observations") ?? []);
  const summary = parseSummary(s.get("observation summary") ?? []);

  // The summary gives group, status, number and title; details add the rest.
  const byNumber = new Map(details.map((d) => [d.number, d]));
  let observations: SourceObservation[];
  if (summary.length) {
    observations = summary.map((row) => {
      const d = byNumber.get(row.number);
      if (!d) warnings.push(`Observation ${row.number} is in the summary but its details weren't found.`);
      return { ...(d ?? emptyDetail(row.number)), number: row.number, status: row.status, title: row.title, group: row.group };
    });
    for (const d of details) if (!summary.some((r) => r.number === d.number)) {
      warnings.push(`Observation ${d.number} has details but isn't in the summary.`);
      observations.push(d);
    }
  } else {
    if (details.length) warnings.push("No observation summary was found; statuses, titles and groups come from the details.");
    observations = details;
  }

  return {
    sequence,
    title: titleItem?.text.trim() ?? "",
    projectName: infoLines[0] ?? "",
    address: infoLines.slice(1).join(", "),
    headerDate,
    headerTime: dm?.[2] ? parseTime(dm[2]) : "",
    ongoingWork,
    attendees,
    observations,
    disclaimer: joinLines(s.get("disclaimer") ?? []),
    warnings,
  };
}

const emptyDetail = (number: string): SourceObservation => ({
  number,
  status: "",
  title: "",
  group: null,
  originalDate: null,
  description: "",
  updates: [],
  captions: [],
});

/** Attendee table: Role and company name | Name | Contact information | Present. */
function parseAttendees(items: TextItem[], warnings: string[]): SourceAttendee[] {
  const ls = lines(items);
  const headerIdx = ls.findIndex((l) => l.some((i) => /role and company/i.test(i.text)));
  if (headerIdx < 0) return [];
  const head = ls[headerIdx];
  const col = (re: RegExp) => head.find((i) => re.test(i.text))?.x;
  const nameX = col(/^name$/i);
  const contactX = col(/contact/i);
  const presentX = col(/present/i);
  if (nameX === undefined || contactX === undefined || presentX === undefined) {
    warnings.push("The attendee table couldn't be read.");
    return [];
  }
  const colOf = (i: TextItem) => (i.x >= presentX - 5 ? "present" : i.x >= contactX - 5 ? "contact" : i.x >= nameX - 5 ? "name" : "role");
  const rows: Array<{ role: string[]; name: string[]; contact: string[]; present: string[] }> = [];
  for (const l of ls.slice(headerIdx + 1)) {
    // A new attendee starts on a line with a name.
    if (l.some((i) => colOf(i) === "name") || !rows.length) rows.push({ role: [], name: [], contact: [], present: [] });
    const row = rows.at(-1)!;
    for (const i of l) row[colOf(i)].push(i.text.trim());
  }
  return rows
    .filter((r) => r.name.length)
    .map((r) => {
      const roleText = r.role.join(" ");
      const company = roleText.match(/\[([^\]]*)\]/)?.[1]?.trim() ?? "";
      const contact = r.contact.join(" ");
      const email = contact.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ?? "";
      return {
        role: roleText.replace(/\[[^\]]*\]/, "").trim(),
        company,
        name: r.name.join(" ").trim(),
        email,
        phone: contact.replace(email, "").trim(),
        present: r.present.some((p) => /✔|✓|yes/i.test(p)),
      };
    });
}

/** Observation details: left column (status, number, title, date), right column (description, updates), captions. */
function parseDetails(items: TextItem[]): SourceObservation[] {
  const body = items.filter((i) => !(i.text.trim() === "Observation" || i.text.trim() === "Description"));
  const leftEdge = Math.min(...body.map((i) => i.x), Infinity);
  const left = body.filter((i) => i.x < leftEdge + 90);
  const right = body.filter((i) => i.x >= leftEdge + 90);

  // Classify left-column lines. An observation's number line may have its
  // status's first word on the line just above ("REQUIRES" / "ATTENTION 8.1").
  // A lone line in capitals followed, after a normal gap, by an observation is
  // a group heading.
  const leftLines = lines(left);
  const hasNumber = (l: TextItem[]) => l.some((i) => NUMBER.test(i.text.trim()));
  const loneCaps = (l: TextItem[]) => l.length === 1 && isStatusWord(l[0].text) && !hasNumber(l);
  const close = (a: TextItem[], b: TextItem[] | undefined) => !!b && a[0].page === b[0].page && a[0].y - b[0].y <= a[0].size * 1.6;
  const kind: Array<"number" | "statusStart" | "group" | "text"> = leftLines.map(() => "text");
  leftLines.forEach((l, i) => {
    if (hasNumber(l)) kind[i] = "number";
  });
  leftLines.forEach((l, i) => {
    if (kind[i] !== "text" || !loneCaps(l)) return;
    if (kind[i + 1] === "number" && close(l, leftLines[i + 1])) kind[i] = "statusStart";
  });
  leftLines.forEach((l, i) => {
    if (kind[i] !== "text" || !loneCaps(l)) return;
    const next = kind[i + 1];
    if ((next === "number" || next === "statusStart") && !close(l, leftLines[i + 1])) kind[i] = "group";
  });

  // Blocks start at a status line (or the number line) and run to the next block.
  type Block = { number: string; page: number; top: number; group: string | null; left: TextItem[]; text: TextItem[]; captions: TextItem[] };
  const blocks: Block[] = [];
  let group: string | null = null;
  leftLines.forEach((l, i) => {
    if (kind[i] === "group") {
      group = l[0].text.trim();
      return;
    }
    const startsBlock = kind[i] === "statusStart" || (kind[i] === "number" && kind[i - 1] !== "statusStart");
    if (startsBlock) {
      const numberLine = kind[i] === "number" ? l : leftLines[i + 1];
      const num = numberLine.find((x) => NUMBER.test(x.text.trim()))!.text.trim();
      blocks.push({ number: num, page: l[0].page, top: l[0].y + 3, group, left: [], text: [], captions: [] });
    }
    blocks.at(-1)?.left.push(...l);
  });
  const owner = (it: TextItem): Block | undefined => {
    let found: Block | undefined;
    for (const b of blocks) if (b.page < it.page || (b.page === it.page && b.top >= it.y)) found = b;
    return found;
  };
  for (const i of right) {
    const b = owner(i);
    if (!b) continue;
    if (i.size < 8) b.captions.push(i);
    else b.text.push(i);
  }
  // Photo grid: evenly spaced columns, found from where captions start again and again.
  const xs = new Map<number, number>();
  for (const i of right) if (i.size < 8) xs.set(Math.round(i.x), (xs.get(Math.round(i.x)) ?? 0) + 1);
  const repeated = [...xs].filter(([, n]) => n >= 2).map(([x]) => x);
  // With few photos, columns may not repeat; then every distinct start (at least a cell apart) counts.
  const frequent = (repeated.length >= 2 ? repeated : [...xs.keys()]).sort((a, b) => a - b);
  const first = frequent[0] ?? 0;
  const gaps = frequent.slice(1).map((x, i) => x - frequent[i]).filter((g) => g >= (repeated.length >= 2 ? 50 : 80));
  const spacing = gaps.length ? Math.min(...gaps) : Infinity;
  const columns = Number.isFinite(spacing) ? Array.from({ length: 12 }, (_, k) => first + k * spacing) : frequent;

  return blocks.map((b) => {
    const flat = lines(b.left).flatMap((l) => l.map((i) => i.text.trim()));
    const dateText = flat.find((t) => LONG_DATE.test(t));
    const numberIdx = flat.indexOf(b.number);
    const status = flat.slice(0, numberIdx).filter(isStatusWord).join(" ");
    const title = flat.slice(numberIdx + 1).filter((t) => t !== dateText).join(" ");

    // Description, then "Update MM/DD/YY: …" entries.
    const chunks: Array<{ kind: "desc" | "update"; items: TextItem[] }> = [];
    for (const l of lines(b.text)) {
      const startsUpdate = matchUpdate(l[0].text) !== null;
      if (startsUpdate || !chunks.length) chunks.push({ kind: startsUpdate ? "update" : "desc", items: [...l] });
      else chunks.at(-1)!.items.push(...l);
    }
    let description = "";
    const updates: SourceUpdate[] = [];
    for (const c of chunks) {
      const text = joinLines(c.items);
      if (c.kind === "desc") description = description ? `${description}\n${text}` : text;
      else {
        updates.push(matchUpdate(text)!);
      }
    }

    return {
      number: b.number,
      status,
      title,
      group: b.group,
      originalDate: dateText ? parseLongDate(dateText) : null,
      description,
      updates,
      captions: captionCells(b.captions, columns),
    };
  });
}

/**
 * An observation's notes from the CSV export: the description, then updates,
 * separated by "******". Updates usually start "Update MM/DD/YY:"; one without
 * a date keeps an empty date.
 */
export function parseNotes(notes: string): { description: string; updates: SourceUpdate[] } {
  // Line breaks arrive as "\r"; keep them as paragraphs, without blank-ish lines.
  const tidy = (p: string) =>
    p
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter((l, i, all) => l || (i > 0 && all[i - 1]))
      .join("\n")
      .trim();
  const parts = notes.split(/\s*\*{6}\s*/).map(tidy).filter(Boolean);
  let description = "";
  const updates: SourceUpdate[] = [];
  parts.forEach((p, i) => {
    const u = matchUpdate(p);
    if (u) updates.push(u);
    else if (i === 0) description = p;
    else updates.push({ date: "", text: p });
  });
  return { description, updates };
}

/** Captions: one per photo cell; a cell's wrapped lines sit just below it at the same x. */
function captionCells(items: TextItem[], columns: number[]): string[] {
  // Photos sit on a grid; pdf.js can split a caption line into pieces, so a
  // piece that doesn't start at a grid column continues the one to its left.
  const atColumn = (x: number) => columns.some((c) => Math.abs(c - x) <= 3);
  const pieces: TextItem[] = [];
  for (const l of lines(items)) {
    for (const it of l) {
      const prev = pieces.at(-1);
      if (prev && prev.page === it.page && Math.abs(prev.y - it.y) <= SAME_LINE && !atColumn(it.x)) {
        pieces[pieces.length - 1] = { ...prev, text: `${prev.text.trim()} ${it.text.trim()}` };
      } else pieces.push({ ...it });
    }
  }
  const cells: Array<{ page: number; x: number; topY: number; lastY: number; text: string }> = [];
  for (const it of pieces.sort(before)) {
    const cell = cells.find((c) => c.page === it.page && Math.abs(c.x - it.x) <= 2 && c.lastY - it.y > 0 && c.lastY - it.y <= it.size * 1.8);
    if (cell) {
      cell.text += ` ${it.text.trim()}`;
      cell.lastY = it.y;
    } else cells.push({ page: it.page, x: it.x, topY: it.y, lastY: it.y, text: it.text.trim() });
  }
  return cells.sort((a, b) => a.page - b.page || b.topY - a.topY || a.x - b.x).map((c) => c.text);
}

/** The "Observation summary" table: group headings and status | number | title rows. */
function parseSummary(items: TextItem[]): Array<{ group: string | null; status: string; number: string; title: string }> {
  const rows: Array<{ group: string | null; status: string; number: string; title: string }> = [];
  let group: string | null = null;
  for (const l of lines(items)) {
    const numIdx = l.findIndex((i) => NUMBER.test(i.text.trim()));
    if (numIdx >= 0) {
      rows.push({
        group,
        status: l.slice(0, numIdx).map((i) => i.text.trim()).join(" "),
        number: l[numIdx].text.trim(),
        title: l.slice(numIdx + 1).map((i) => i.text.trim()).join(" "),
      });
    } else if (l.length === 1 && isStatusWord(l[0].text) && l[0].x < 100) {
      group = l[0].text.trim();
    } else if (rows.length) {
      // A title that wrapped onto the next line.
      rows.at(-1)!.title += ` ${l.map((i) => i.text.trim()).join(" ")}`;
    }
  }
  return rows;
}

// ---- Photo files ----

export interface SourcePhotoFile {
  /** Path within the export (as given). */
  path: string;
  /** Report the file was exported with. */
  report: number;
  /** Observation number when the photo was taken in the observation's own report (e.g. "5.7"); null otherwise. */
  number: string | null;
  groupSlug: string;
  captionSlug: string;
  /** ArchiSnapper's picture ID (also in the CSV's picture links). */
  id: string;
  /** Local date the photo was taken (YYYY-MM-DD) and a sortable timestamp. */
  date: string;
  timestamp: string;
}

const FILE = /^observation_(\d+)-(\d*)_([^_]*)_(.*)_(\d{4}-\d{2}-\d{2})-(\d{2})-(\d{2})-(\d{2})-\d{4}_(\d+)_\.(jpe?g|png)$/i;

/** "observation_5-7_level-0_louvers_2026-02-11-17-17-53-0100_33250278_.jpg" → parts; null if not an ArchiSnapper photo. */
export function parsePhotoFileName(path: string): SourcePhotoFile | null {
  const name = path.split(/[\\/]/).pop() ?? path;
  const m = name.match(FILE);
  if (!m) return null;
  return {
    path,
    report: Number(m[1]),
    number: m[2] ? `${m[1]}.${m[2]}` : null,
    groupSlug: m[3].toLowerCase(),
    captionSlug: m[4].toLowerCase(),
    date: m[5],
    id: m[9],
    timestamp: `${m[5]}T${m[6]}:${m[7]}:${m[8]}#${m[9]}`,
  };
}

/** How ArchiSnapper writes text into file names: lower case, runs of other characters as "-". */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
