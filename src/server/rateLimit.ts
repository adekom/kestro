import "server-only";

// Best-effort, per-instance fixed-window limiter for the unauthenticated photo
// viewer. Multiple App Hosting instances each keep their own window.
const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimited(key: string, limit = 120): boolean {
  const t = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt < t) {
    if (hits.size > 10_000) hits.clear();
    hits.set(key, { count: 1, resetAt: t + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > limit;
}

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
