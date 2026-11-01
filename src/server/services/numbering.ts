import "server-only";
import { observationsCol } from "../paths";
import { getSettings } from "./settings";
import { runningOffsets, type Numbering } from "@/lib/domain";
import type { Observation } from "@/lib/types";

/** The company's observation number format, with what running numbers need. */
export async function numberingFor(pid: string, reportSequenceById: ReadonlyMap<string, number>): Promise<Numbering> {
  const { numberFormat } = await getSettings();
  if (numberFormat !== "running") return { format: numberFormat };
  const live = await observationsCol(pid).where("deletedAt", "==", null).get();
  return { format: "running", offsets: runningOffsets(live.docs.map((d) => d.data() as Observation), reportSequenceById) };
}
