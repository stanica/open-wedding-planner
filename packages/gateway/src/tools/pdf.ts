import { tool } from "ai";
import { z } from "zod";

export interface ParsedPdf {
  url: string;
  text: string;
  pages: number;
  info: Record<string, unknown>;
}

export type PdfFetchFn = (url: string) => Promise<Buffer>;

let pdfFetchFn: PdfFetchFn = async (url: string) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "WeddingPlannerBot/1.0" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
};

export function setPdfFetchFn(fn: PdfFetchFn) {
  pdfFetchFn = fn;
}

export type PdfParseFn = (buffer: Buffer) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;

let pdfParseFn: PdfParseFn | null = null;

export function setPdfParseFn(fn: PdfParseFn) {
  pdfParseFn = fn;
}

export const pdfTool = tool({
  description:
    "Download and extract text from a PDF file. Returns the text content, page count, and document metadata.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL of the PDF to parse"),
  }),
  execute: async ({ url }) => {
    const buffer = await pdfFetchFn(url);
    let parse: PdfParseFn;
    if (pdfParseFn) {
      parse = pdfParseFn;
    } else {
      const pdfParse = await import("pdf-parse");
      parse = (pdfParse as any).default ?? pdfParse;
    }
    const result = await parse(buffer);
    return {
      url,
      text: result.text.slice(0, 20_000),
      pages: result.numpages,
      info: result.info,
    } satisfies ParsedPdf;
  },
});
