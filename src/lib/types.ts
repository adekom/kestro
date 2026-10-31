// Shared domain types. Internal identity is always a UUID; human-facing
// report and observation numbers are derived and may change (spec §4.1).

/** Calendar date as YYYY-MM-DD; compares correctly as a string. */
export type IsoDate = string;
/** Instant as an ISO-8601 string. */
export type IsoTimestamp = string;

export type Role = "admin" | "editor";

export interface AppUser {
  /** Lower-cased email; also the document ID so staff can be allowlisted before first sign-in. */
  email: string;
  role: Role;
  enabled: boolean;
  uid: string | null;
  /** The staff member's entry in the firm contact list (holds their name). */
  contactId: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  lastSignInAt: IsoTimestamp | null;
}

export interface StatusDef {
  id: string;
  label: string;
  /** #RRGGBB */
  color: string;
  order: number;
}

export interface FieldVisibility {
  address: boolean;
  contact: boolean;
  attendance: boolean;
  ongoingWork: boolean;
  author: boolean;
}

export interface OrgSettings {
  name: string;
  address: string;
  contactLine: string;
  /** Storage path of the header logo, if uploaded. */
  logoPath: string | null;
  disclaimer: string;
  footerText: string;
  showSummaryDefault: boolean;
  fieldVisibility: FieldVisibility;
  statuses: StatusDef[];
  /** Exactly one status is "resolved", identified by ID, never by label. */
  resolvedStatusId: string;
  updatedAt: IsoTimestamp | null;
}

export interface Group {
  id: string;
  name: string;
  order: number;
}

export interface Project {
  id: string;
  name: string;
  code: string;
  address: string;
  description: string;
  /** Prefix shown before the report number, e.g. "Field Report ". */
  reportPrefix: string;
  groups: Group[];
  archived: boolean;
  /** Number of live (not soft-deleted) reports; equals the highest sequence. */
  reportCount: number;
  /** Firm contacts involved in this project, with their role on it. */
  contacts: ProjectContact[];
  /** Same IDs as `contacts`, kept for array-contains queries ("My projects"). */
  contactIds: string[];
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** Entry in the firm-wide contact list. Staff members are contacts too. */
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  /** Required and unique across the firm (compared case-insensitively). */
  email: string;
  /** Lower-cased email used for the uniqueness check. */
  emailKey: string;
  phone: string;
  /** Set when this contact is a Kestro user. */
  userEmail: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ProjectContact {
  contactId: string;
  /** Role on this project, e.g. "Contractor" or "Owner's representative". */
  projectRole: string;
}

export interface Attendee {
  id: string;
  contactId: string | null;
  name: string;
  company: string;
  present: boolean;
}

export type SummaryOverride = "default" | "show" | "hide";

export interface Report {
  id: string;
  projectId: string;
  /** Current gap-free display number within the project (1-based). Mutable. */
  sequence: number;
  visitDate: IsoDate;
  visitTime: string;
  authorName: string;
  ongoingWork: string;
  attendees: Attendee[];
  summaryOverride: SummaryOverride;
  /** Next origin-local sequence for observations created in this report. */
  nextLocalSeq: number;
  /** Report this one was created from, if any. */
  sourceReportId: string | null;
  deletedAt: IsoTimestamp | null;
  version: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

/** Report → observation membership. Document ID equals the observation ID. */
export interface Membership {
  observationId: string;
  order: number;
  addedAt: IsoTimestamp;
}

export interface Observation {
  id: string;
  projectId: string;
  originReportId: string;
  originLocalSeq: number;
  title: string;
  description: string;
  originalDate: IsoDate;
  groupId: string | null;
  deletedAt: IsoTimestamp | null;
  version: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface ObservationUpdate {
  id: string;
  observationId: string;
  reportId: string;
  date: IsoDate;
  text: string;
  /** Stable intra-day order. */
  order: number;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface StatusEvent {
  id: string;
  observationId: string;
  statusId: string;
  date: IsoDate;
  reportId: string | null;
  createdAt: IsoTimestamp;
}

export interface Photo {
  id: string;
  projectId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  width: number;
  height: number;
  originalPath: string;
  webPath: string;
  thumbPath: string;
  uploadedBy: string;
  createdAt: IsoTimestamp;
}

export interface PhotoAttachment {
  id: string;
  photoId: string;
  observationId: string;
  /** Report in which the photo was attached; it appears from this visit onwards. */
  reportId: string;
  date: IsoDate;
  order: number;
  caption: string;
  /** Current public bearer token for this attachment, if shared. Server-only. */
  shareToken: string | null;
  /** Detached attachments are hidden in the app but keep previously exported links working. */
  detachedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface PhotoShare {
  /** SHA-256 of the bearer token; the document ID. */
  tokenHash: string;
  projectId: string;
  attachmentId: string;
  photoId: string;
  revokedAt: IsoTimestamp | null;
  createdAt: IsoTimestamp;
}
