"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

interface SaveStatusCtx {
  state: SaveState;
  message: string | null;
  report: (key: string, state: SaveState, message?: string | null) => void;
}

const Ctx = createContext<SaveStatusCtx | null>(null);

/** Aggregates autosave state from every field on the page into one indicator. */
export function SaveStatusProvider({ children }: { children: React.ReactNode }) {
  const [states, setStates] = useState<Record<string, { state: SaveState; message: string | null }>>({});
  const report = useCallback((key: string, state: SaveState, message: string | null = null) => {
    setStates((s) => ({ ...s, [key]: { state, message } }));
  }, []);
  const values = Object.values(states);
  const failed = values.find((v) => v.state === "error");
  const state: SaveState = failed
    ? "error"
    : values.some((v) => v.state === "saving")
      ? "saving"
      : values.some((v) => v.state === "saved")
        ? "saved"
        : "idle";
  return <Ctx.Provider value={{ state, message: failed?.message ?? null, report }}>{children}</Ctx.Provider>;
}

export function SaveIndicator() {
  const ctx = useContext(Ctx);
  if (!ctx || ctx.state === "idle") return null;
  const text = { saving: "Saving…", saved: "All changes saved", error: ctx.message ?? "Not saved" }[ctx.state];
  return (
    <span role="status" aria-live="polite" className={`text-xs ${ctx.state === "error" ? "text-danger" : "text-text-muted"}`}>
      {text}
    </span>
  );
}

type SaveFn<T> = (value: T) => Promise<{ ok: true } | { ok: false; error: string; conflict?: boolean }>;

/**
 * Debounced autosave for a value. Reports progress to the page indicator and
 * flushes pending changes when the component unmounts.
 */
export function useAutosave<T>(key: string, value: T, save: SaveFn<T>, delayMs = 800) {
  const ctx = useContext(Ctx);
  const [state, setState] = useState<SaveState>("idle");
  const [conflict, setConflict] = useState(false);
  const last = useRef(JSON.stringify(value));
  const pending = useRef<T | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const flush = useCallback(async () => {
    const v = pending.current;
    if (v === null) return;
    pending.current = null;
    setState("saving");
    ctxRef.current?.report(key, "saving");
    const res = await saveRef.current(v);
    if (res.ok) {
      last.current = JSON.stringify(v);
      setState("saved");
      ctxRef.current?.report(key, "saved");
    } else {
      setState("error");
      setConflict(Boolean(res.conflict));
      ctxRef.current?.report(key, "error", res.error);
    }
  }, [key]);

  useEffect(() => {
    if (conflict) return; // stop overwriting once someone else's change is detected
    const serialized = JSON.stringify(value);
    if (serialized === last.current) return;
    pending.current = value;
    const t = setTimeout(flush, delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs, flush, conflict]);

  useEffect(() => () => void flush(), [flush]);

  return { state, conflict };
}
