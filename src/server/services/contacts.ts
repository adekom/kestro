import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "../firebaseAdmin";
import { contactsCol, projectsCol } from "../paths";
import { newId, now } from "../time";
import { UserError } from "../errors";
import { getSettings } from "./settings";
import { contactName, EMAIL_PATTERN, emailKey } from "@/lib/domain";
import type { Contact, Project } from "@/lib/types";

export type ContactInput = Pick<Contact, "firstName" | "lastName" | "company" | "title" | "email" | "phone"> & { defaultRole?: string };

/** Thrown when another contact already uses the email; carries that contact so the UI can offer it instead. */
export class DuplicateContactError extends UserError {
  constructor(readonly existing: Contact) {
    super(`${contactName(existing) || existing.email} already uses ${existing.email}. Choose the existing contact instead.`);
    this.name = "DuplicateContactError";
  }
}

function clean(input: ContactInput): Required<ContactInput> {
  const out = {
    defaultRole: String(input.defaultRole ?? "").trim().slice(0, 100),
    firstName: input.firstName.trim().slice(0, 100),
    lastName: input.lastName.trim().slice(0, 100),
    company: input.company.trim().slice(0, 200),
    title: input.title.trim().slice(0, 200),
    email: input.email.trim().slice(0, 200),
    phone: input.phone.trim().slice(0, 100),
  };
  if (!out.firstName) throw new UserError("First name is required.");
  if (!out.email) throw new UserError("Email is required.");
  if (!EMAIL_PATTERN.test(out.email)) throw new UserError("Enter a valid email address.");
  return out;
}

/**
 * Fills fields added after a contact was created. Staff always show the
 * company name from Company Details (`companyName`), whatever is stored.
 */
const normalize = (c: Contact, companyName?: string): Contact => ({
  ...c,
  defaultRole: c.defaultRole ?? "",
  ...(c.userEmail && companyName !== undefined ? { company: companyName } : {}),
});
const companyName = async () => (await getSettings()).name;

const byName = (a: Contact, b: Contact) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.email.localeCompare(b.email);

export async function listContacts(): Promise<Contact[]> {
  const [snap, company] = await Promise.all([contactsCol().get(), companyName()]);
  return snap.docs.map((d) => normalize(d.data() as Contact, company)).sort(byName);
}

export async function getContact(id: string): Promise<Contact> {
  const [snap, company] = await Promise.all([contactsCol().doc(id).get(), companyName()]);
  if (!snap.exists) throw new UserError("Contact not found.");
  return normalize(snap.data() as Contact, company);
}

export async function getContactsByIds(ids: string[]): Promise<Map<string, Contact>> {
  if (!ids.length) return new Map();
  const [snaps, company] = await Promise.all([db().getAll(...ids.map((id) => contactsCol().doc(id))), companyName()]);
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, normalize(s.data() as Contact, company)]));
}

export async function findContactByEmail(email: string, tx?: Transaction): Promise<Contact | null> {
  const query = contactsCol().where("emailKey", "==", emailKey(email)).limit(1);
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.empty ? null : normalize(snap.docs[0].data() as Contact);
}

/**
 * Creates a firm contact inside `tx`. The email lookup runs in the same
 * transaction, so two people adding the same email at once cannot both succeed.
 */
export async function createContactInTx(tx: Transaction, input: ContactInput, userEmail: string | null = null): Promise<Contact> {
  const c = clean(input);
  const existing = await findContactByEmail(c.email, tx);
  if (existing) throw new DuplicateContactError(existing);
  const contact: Contact = { id: newId(), ...c, emailKey: emailKey(c.email), userEmail, createdAt: now(), updatedAt: now() };
  tx.create(contactsCol().doc(contact.id), contact);
  return contact;
}

export async function createContact(input: ContactInput): Promise<Contact> {
  return db().runTransaction((tx) => createContactInTx(tx, input));
}

export async function updateContact(id: string, input: ContactInput): Promise<void> {
  const c = clean(input);
  await db().runTransaction(async (tx) => {
    const ref = contactsCol().doc(id);
    const current = (await tx.get(ref)).data() as Contact | undefined;
    if (!current) throw new UserError("Contact not found.");
    if (emailKey(c.email) !== current.emailKey) {
      // A staff member's email is their sign-in identity; it changes only via Staff settings.
      if (current.userEmail) throw new UserError("This contact is a Kestro user; their email can't be changed here.");
      const existing = await findContactByEmail(c.email, tx);
      if (existing) throw new DuplicateContactError(existing);
    }
    // Staff belong to this company; their company comes from Company Details.
    const { company, ...rest } = c;
    tx.update(ref, { ...rest, ...(current.userEmail ? {} : { company }), emailKey: emailKey(c.email), updatedAt: now() });
  });
}

/**
 * Returns the contact for a staff member, linking an existing contact with the
 * same email or creating one. Used when staff are added and at first sign-in.
 */
export async function ensureStaffContactInTx(
  tx: Transaction,
  email: string,
  names: { firstName: string; lastName: string },
): Promise<string> {
  const existing = await findContactByEmail(email, tx);
  if (existing) {
    tx.update(contactsCol().doc(existing.id), { userEmail: emailKey(email), updatedAt: now() });
    return existing.id;
  }
  const firstName = names.firstName.trim() || email.split("@")[0];
  const contact = await createContactInTx(
    tx,
    { firstName, lastName: names.lastName, company: "", title: "", email, phone: "", defaultRole: "" },
    emailKey(email),
  );
  return contact.id;
}

/**
 * Deletes contacts from Kestro and removes them from every project. Staff
 * can't be deleted here (they're managed as staff). Attendance already
 * recorded in reports keeps the name and company as written.
 */
export async function deleteContacts(ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].slice(0, 400);
  if (!unique.length) return;
  const found = await getContactsByIds(unique);
  const staff = [...found.values()].filter((x) => x.userEmail);
  if (staff.length) throw new UserError(`${staff.map((x) => contactName(x) || x.email).join(", ")} ${staff.length > 1 ? "are" : "is"} staff and can't be deleted here.`);
  const gone = new Set(found.keys());
  const projects = await projectsCol().get();
  const batch = db().batch();
  for (const d of projects.docs) {
    const p = d.data() as Project;
    if (!(p.contactIds ?? []).some((id) => gone.has(id))) continue;
    batch.update(d.ref, {
      contacts: (p.contacts ?? []).filter((x) => !gone.has(x.contactId)),
      contactIds: (p.contactIds ?? []).filter((id) => !gone.has(id)),
      updatedAt: now(),
    });
  }
  for (const id of gone) batch.delete(contactsCol().doc(id));
  await batch.commit();
}
