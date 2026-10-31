import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "../firebaseAdmin";
import { contactsCol } from "../paths";
import { newId, now } from "../time";
import { UserError } from "../errors";
import { contactName, EMAIL_PATTERN, emailKey } from "@/lib/domain";
import type { Contact } from "@/lib/types";

export type ContactInput = Pick<Contact, "firstName" | "lastName" | "company" | "title" | "email" | "phone">;

/** Thrown when another contact already uses the email; carries that contact so the UI can offer it instead. */
export class DuplicateContactError extends UserError {
  constructor(readonly existing: Contact) {
    super(`${contactName(existing) || existing.email} already uses ${existing.email}. Choose the existing contact instead.`);
    this.name = "DuplicateContactError";
  }
}

function clean(input: ContactInput): ContactInput {
  const out = {
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

const byName = (a: Contact, b: Contact) =>
  a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName) || a.email.localeCompare(b.email);

export async function listContacts(): Promise<Contact[]> {
  const snap = await contactsCol().get();
  return snap.docs.map((d) => d.data() as Contact).sort(byName);
}

export async function getContact(id: string): Promise<Contact> {
  const snap = await contactsCol().doc(id).get();
  if (!snap.exists) throw new UserError("Contact not found.");
  return snap.data() as Contact;
}

export async function getContactsByIds(ids: string[]): Promise<Map<string, Contact>> {
  if (!ids.length) return new Map();
  const snaps = await db().getAll(...ids.map((id) => contactsCol().doc(id)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, s.data() as Contact]));
}

export async function findContactByEmail(email: string, tx?: Transaction): Promise<Contact | null> {
  const query = contactsCol().where("emailKey", "==", emailKey(email)).limit(1);
  const snap = tx ? await tx.get(query) : await query.get();
  return snap.empty ? null : (snap.docs[0].data() as Contact);
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
    tx.update(ref, { ...c, emailKey: emailKey(c.email), updatedAt: now() });
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
    { firstName, lastName: names.lastName, company: "", title: "", email, phone: "" },
    emailKey(email),
  );
  return contact.id;
}
