"use client";

import { createContext, useContext } from "react";
import { setDateFormat } from "@/lib/domain";
import type { DateFormat } from "@/lib/types";

interface CompanyDefaults {
  dateFormat: DateFormat;
  defaultReportPrefix: string;
}

const Ctx = createContext<CompanyDefaults>({ dateFormat: "us", defaultReportPrefix: "Field Report " });

/** Company-wide display settings for the browser. Sets the date format before any page renders. */
export function CompanyProvider({ value, children }: { value: CompanyDefaults; children: React.ReactNode }) {
  setDateFormat(value.dateFormat);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCompany = () => useContext(Ctx);
