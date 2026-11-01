// Reads the positioned text of a PDF in the browser with pdf.js (in a worker).
import type { TextItem } from "./parse";

type PdfJs = typeof import("pdfjs-dist");
let loading: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  loading ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerPort = new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    return lib;
  });
  return loading;
}

export async function readPdfText(file: File): Promise<TextItem[]> {
  const lib = await pdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), verbosity: 0 }).promise;
  const out: TextItem[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const { items } = await page.getTextContent();
      for (const it of items) {
        if (!("str" in it) || !it.str.trim()) continue;
        out.push({ page: p, x: it.transform[4], y: it.transform[5], size: Math.hypot(it.transform[0], it.transform[1]), text: it.str });
      }
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
