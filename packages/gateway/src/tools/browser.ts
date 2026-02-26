import { tool } from "ai";
import { z } from "zod";

export interface BrowseResult {
  url: string;
  title: string;
  textContent: string;
  selectedContent?: string;
}

export type BrowseFn = (
  url: string,
  options?: { selector?: string; waitFor?: string },
) => Promise<BrowseResult>;

let browseFn: BrowseFn | null = null;

export function setBrowseFn(fn: BrowseFn) {
  browseFn = fn;
}

async function defaultBrowse(
  url: string,
  options?: { selector?: string; waitFor?: string },
): Promise<BrowseResult> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });

    if (options?.waitFor) {
      await page.waitForSelector(options.waitFor, { timeout: 10_000 }).catch(() => {});
    }

    const title = await page.title();
    const textContent = await page.evaluate(() => {
      document.querySelectorAll("script, style, nav, footer, header, noscript").forEach((el) => el.remove());
      return (document.body?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 10_000);
    });

    let selectedContent: string | undefined;
    if (options?.selector) {
      selectedContent = await page
        .locator(options.selector)
        .textContent()
        .catch(() => undefined) ?? undefined;
    }

    return { url, title, textContent, selectedContent };
  } finally {
    await browser.close();
  }
}

export const browserTool = tool({
  description:
    "Load a web page in a headless browser (for JS-heavy sites that the scraper can't handle). Returns the rendered text content. Optionally extract content matching a CSS selector.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL to browse"),
    selector: z
      .string()
      .optional()
      .describe("CSS selector to extract specific content"),
    waitFor: z
      .string()
      .optional()
      .describe("CSS selector to wait for before extracting"),
  }),
  execute: async ({ url, selector, waitFor }) => {
    const fn = browseFn ?? defaultBrowse;
    return fn(url, { selector, waitFor });
  },
});
