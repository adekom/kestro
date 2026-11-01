import "server-only";
import type { Transaction } from "firebase-admin/firestore";
import { db } from "./firebaseAdmin";

/**
 * Runs a Firestore transaction, also retrying one the server abandoned before
 * it committed. Under heavy contention the emulator closes a competing
 * transaction with INVALID_ARGUMENT ("Transaction is invalid or closed"),
 * which the client library does not retry itself. Nothing was written, so
 * running it again is safe.
 */
export async function runTransaction<T>(fn: (tx: Transaction) => Promise<T>, maxAttempts = 15): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db().runTransaction(fn, { maxAttempts });
    } catch (e) {
      const closed = (e as { code?: number }).code === 3 && /Transaction is invalid or closed/.test(String((e as Error).message));
      if (!closed || attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 50 * attempt + Math.random() * 100));
    }
  }
}
