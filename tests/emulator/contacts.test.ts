import { beforeEach, describe, expect, it } from "vitest";
import { resetEmulators } from "../support/fixtures";
import { createContact, DuplicateContactError, listContacts, updateContact } from "@/server/services/contacts";
import {
  addProjectContacts,
  createProject,
  getProject,
  listProjectsForContact,
  removeProjectContacts,
  listProjects,
  setProjectsArchived,
} from "@/server/services/projects";
import { addUser, completeBootstrap, recordSignIn } from "@/server/services/users";
import { usersCol } from "@/server/paths";
import { allowlist } from "../support/fixtures";

beforeEach(resetEmulators);

const person = (email: string, firstName = "Pat") => ({ firstName, lastName: "Example", company: "Build Co", title: "", email, phone: "" });
const project = (name = "P") => ({ name, code: "", address: "", description: "", reportPrefix: "Report " });

describe("firm contact list", () => {
  it("requires an email and a first name", async () => {
    await expect(createContact(person(""))).rejects.toThrow(/Email is required/);
    await expect(createContact(person("not-an-email"))).rejects.toThrow(/valid email/);
    await expect(createContact(person("a@example.com", ""))).rejects.toThrow(/First name/);
  });

  it("rejects a duplicate email regardless of case and reports the existing contact", async () => {
    const first = await createContact(person("Pat@Example.com"));
    const err = await createContact(person(" pat@example.COM ", "Other")).catch((e) => e);
    expect(err).toBeInstanceOf(DuplicateContactError);
    expect((err as DuplicateContactError).existing.id).toBe(first.id);
    expect(await listContacts()).toHaveLength(1);
  });

  it("allows only one of two simultaneous creates with the same email", async () => {
    const results = await Promise.allSettled([createContact(person("same@example.com")), createContact(person("same@example.com"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await listContacts()).toHaveLength(1);
  });

  it("refuses to change a contact's email to one already in use", async () => {
    await createContact(person("one@example.com"));
    const two = await createContact(person("two@example.com"));
    await expect(updateContact(two.id, person("ONE@example.com"))).rejects.toBeInstanceOf(DuplicateContactError);
    await updateContact(two.id, { ...person("two@example.com"), lastName: "Renamed" });
    expect((await listContacts()).find((c) => c.id === two.id)?.lastName).toBe("Renamed");
  });
});

describe("staff are contacts", () => {
  it("adding staff creates a linked contact, or links an existing one", async () => {
    const existing = await createContact(person("lee@example.com", "Lee"));
    await addUser("lee@example.com", "editor", { firstName: "Lee", lastName: "Example" });
    await addUser("new@example.com", "editor", { firstName: "Nia", lastName: "New" });
    const lee = (await usersCol().doc("lee@example.com").get()).data();
    expect(lee?.contactId).toBe(existing.id);
    const contacts = await listContacts();
    expect(contacts).toHaveLength(2);
    expect(contacts.every((c) => c.userEmail)).toBe(true);
  });

  it("gives staff added before contacts existed a contact at sign-in", async () => {
    await allowlist("old@example.com", "editor");
    await recordSignIn("old@example.com", "uid-old");
    const user = (await usersCol().doc("old@example.com").get()).data();
    expect(user?.contactId).toBeTruthy();
    expect((await listContacts())[0]).toMatchObject({ email: "old@example.com", userEmail: "old@example.com" });
  });

  it("the first administrator gets a contact with their name", async () => {
    await completeBootstrap("owner@example.com", "uid1", process.env.KESTRO_BOOTSTRAP_SECRET!, { firstName: "Olive", lastName: "Owner" });
    expect((await listContacts())[0]).toMatchObject({ firstName: "Olive", lastName: "Owner", email: "owner@example.com" });
  });
});

describe("project contacts", () => {
  it("lists projects for a contact (My projects) and removes only the project link", async () => {
    const pat = await createContact(person("pat@example.com"));
    const mine = await createProject(project("Mine"), [{ contactId: pat.id, projectRole: "Contractor" }]);
    const other = await createProject(project("Other"));
    expect((await listProjectsForContact(pat.id)).map((p) => p.id)).toEqual([mine]);

    await addProjectContacts(other, [{ contactId: pat.id, projectRole: "" }]);
    expect((await listProjectsForContact(pat.id)).map((p) => p.name)).toEqual(["Mine", "Other"]);

    await removeProjectContacts(mine, [pat.id]);
    expect((await getProject(mine)).contacts).toEqual([]);
    expect(await listContacts()).toHaveLength(1); // still in the firm list
  });

  it("removes several contacts from a project at once", async () => {
    const a = await createContact(person("a@example.com"));
    const b = await createContact(person("b@example.com"));
    const c = await createContact(person("c@example.com"));
    const pid = await createProject(project(), [a, b, c].map((x) => ({ contactId: x.id, projectRole: "" })));
    await removeProjectContacts(pid, [a.id, c.id]);
    expect((await getProject(pid)).contactIds).toEqual([b.id]);
  });

  it("refuses unknown contact IDs", async () => {
    await expect(createProject(project(), [{ contactId: "nope", projectRole: "" }])).rejects.toThrow(/no longer exists/);
  });
});

describe("archiving projects", () => {
  it("archives and restores several projects at once", async () => {
    const one = await createProject(project("One"));
    const two = await createProject(project("Two"));
    const three = await createProject(project("Three"));
    await setProjectsArchived([one, three], true);
    expect((await listProjects({ archived: true })).map((p) => p.id).sort()).toEqual([one, three].sort());
    expect((await listProjects({ archived: false })).map((p) => p.id)).toEqual([two]);
    await setProjectsArchived([one], false);
    expect((await listProjects({ archived: false })).map((p) => p.name)).toEqual(["One", "Two"]);
  });
});
