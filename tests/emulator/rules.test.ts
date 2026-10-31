import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";

// Clients never talk to Firestore or Storage directly: every request from a
// browser SDK must be denied, whether anonymous or signed in with any claims.

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-kestro-test",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8180 },
    storage: { rules: readFileSync("storage.rules", "utf8"), host: "127.0.0.1", port: 9299 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

const contexts = () => [
  ["anonymous", env.unauthenticatedContext()],
  ["signed-in editor", env.authenticatedContext("editor-uid", { email: "editor@example.com", email_verified: true })],
  ["signed-in user claiming admin", env.authenticatedContext("x", { email: "x@example.com", role: "admin", admin: true })],
] as const;

describe("Firestore rules deny all client access", () => {
  it.each(["settings/organization", "users/editor@example.com", "projects/p1", "projects/p1/reports/r1", "photoShares/abc"])(
    "denies reading and writing %s",
    async (path) => {
      for (const [, ctx] of contexts()) {
        await assertFails(ctx.firestore().doc(path).get());
        await assertFails(ctx.firestore().doc(path).set({ role: "admin" }));
      }
    },
  );

  it("denies self-promotion to administrator through the client SDK", async () => {
    const [, editor] = contexts()[1];
    await assertFails(editor.firestore().doc("users/editor@example.com").set({ email: "editor@example.com", role: "admin", enabled: true }));
  });

  it("denies collection-group listing", async () => {
    for (const [, ctx] of contexts()) {
      await assertFails(ctx.firestore().collectionGroup("photoAttachments").get());
    }
  });
});

describe("Storage rules deny all client access", () => {
  it("denies reading originals, uploading, and listing the bucket", async () => {
    for (const [, ctx] of contexts()) {
      const storage = ctx.storage();
      await assertFails(storage.ref("projects/p1/photos/x/original.jpg").getDownloadURL());
      await assertFails(storage.ref("projects/p1/photos/x/original.jpg").put(new Uint8Array([1, 2, 3])).then());
      await assertFails(storage.ref("").listAll());
    }
  });
});
