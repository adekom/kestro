import { beforeEach, describe, expect, it, vi } from "vitest";
import { allowlist, resetEmulators, sessionCookieFor } from "../support/fixtures";

// Server actions read the session from next/headers; tests supply the cookie.
let cookie: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (cookie ? { value: cookie } : undefined) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

const actions = await import("@/app/actions");
const { getSessionUser } = await import("@/server/auth");
const users = await import("@/server/services/users");
const { usersCol } = await import("@/server/paths");

beforeEach(async () => {
  await resetEmulators();
  cookie = undefined;
});

describe("sign-in allowlist", () => {
  it("rejects a valid Firebase user who is not on the staff list", async () => {
    cookie = await sessionCookieFor("stranger@example.com");
    expect(await getSessionUser()).toBeNull();
  });

  it("rejects a disabled staff member", async () => {
    await allowlist("former@example.com", "editor", false);
    cookie = await sessionCookieFor("former@example.com");
    expect(await getSessionUser()).toBeNull();
  });

  it("accepts an enabled staff member with their role", async () => {
    await allowlist("editor@example.com", "editor");
    cookie = await sessionCookieFor("editor@example.com");
    expect(await getSessionUser()).toMatchObject({ email: "editor@example.com", role: "editor" });
  });

  it("rejects requests without a session", async () => {
    const res = await actions.createProjectAction({ name: "X", code: "", address: "", description: "", reportPrefix: "" });
    expect(res.ok).toBe(false);
  });
});

describe("administrator-only operations via direct server calls", () => {
  beforeEach(async () => {
    await allowlist("admin@example.com", "admin");
    await allowlist("editor@example.com", "editor");
  });

  it("an editor cannot invite staff", async () => {
    cookie = await sessionCookieFor("editor@example.com");
    const res = await actions.addUserAction("new@example.com", "editor", { firstName: "New", lastName: "Person" });
    expect(res).toMatchObject({ ok: false });
    expect((await usersCol().doc("new@example.com").get()).exists).toBe(false);
  });

  it("an editor cannot grant admin, even to themselves", async () => {
    cookie = await sessionCookieFor("editor@example.com");
    expect(await actions.updateUserAction("editor@example.com", { role: "admin" })).toMatchObject({ ok: false });
    expect((await usersCol().doc("editor@example.com").get()).data()?.role).toBe("editor");
  });

  it("an editor cannot change organization settings or statuses", async () => {
    cookie = await sessionCookieFor("editor@example.com");
    expect(await actions.updateSettingsAction({ name: "Hijacked" })).toMatchObject({ ok: false });
    expect(await actions.saveStatusesAction([{ label: "Only", color: "#000000" }], 0)).toMatchObject({ ok: false });
  });

  it("an admin can invite staff and grant admin", async () => {
    cookie = await sessionCookieFor("admin@example.com");
    expect(await actions.addUserAction("new@example.com", "editor", { firstName: "New", lastName: "Person" })).toMatchObject({ ok: true });
    expect(await actions.updateUserAction("new@example.com", { role: "admin" })).toMatchObject({ ok: true });
  });

  it("the last enabled administrator cannot be demoted or disabled", async () => {
    cookie = await sessionCookieFor("admin@example.com");
    expect(await actions.updateUserAction("admin@example.com", { role: "editor" })).toMatchObject({ ok: false });
    expect(await actions.updateUserAction("admin@example.com", { enabled: false })).toMatchObject({ ok: false });
    await allowlist("second@example.com", "admin");
    expect(await actions.updateUserAction("admin@example.com", { role: "editor" })).toMatchObject({ ok: true });
  });
});

const OWNER = { firstName: "Olive", lastName: "Owner" };

describe("first-administrator bootstrap", () => {
  it("works exactly once with the correct secret", async () => {
    expect(await users.isBootstrapOpen()).toBe(true);
    await expect(users.completeBootstrap("owner@example.com", "uid1", "wrong-secret", OWNER)).rejects.toThrow();
    await users.completeBootstrap("owner@example.com", "uid1", process.env.KESTRO_BOOTSTRAP_SECRET!, OWNER);
    expect((await usersCol().doc("owner@example.com").get()).data()?.role).toBe("admin");
    expect(await users.isBootstrapOpen()).toBe(false);
    await expect(
      users.completeBootstrap("attacker@example.com", "uid2", process.env.KESTRO_BOOTSTRAP_SECRET!, OWNER),
    ).rejects.toThrow(/already/);
    expect((await usersCol().doc("attacker@example.com").get()).exists).toBe(false);
  });
});
