import type { Contact } from "@/lib/types";

/** An error whose message is safe and useful to show to the user. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

/** Another user changed the record since it was loaded. */
export class ConflictError extends UserError {
  constructor(message = "This record was changed by someone else. Reload to see the latest version.") {
    super(message);
    this.name = "ConflictError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; conflict?: boolean; duplicateContact?: Contact };

/** Wraps server-action bodies so only intended messages reach the browser. */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof ConflictError) return { ok: false, error: e.message, conflict: true };
    if (e instanceof UserError && e.name === "DuplicateContactError") {
      return { ok: false, error: e.message, duplicateContact: (e as UserError & { existing: Contact }).existing };
    }
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof Error && e.name === "AuthError") return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
