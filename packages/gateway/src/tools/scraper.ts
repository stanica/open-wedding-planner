import { tool } from "ai";
import { z } from "zod";
import * as cheerio from "cheerio";

export interface ScrapedPage {
  url: string;
  title: string;
  textContent: string;
  contactInfo: {
    emails: string[];
    phones: string[];
    addresses: string[];
  };
  meta: {
    description: string | null;
    keywords: string | null;
    imageUrl: string | null;
  };
}

export type FetchFn = (url: string) => Promise<string>;

let fetchFn: FetchFn = async (url: string) => {
  const res = await fetch(url, {
    headers: { "User-Agent": "WeddingPlannerBot/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.text();
};

export function setScraperFetch(fn: FetchFn) {
  fetchFn = fn;
}

function extractContactInfo(text: string) {
  const emails = [...new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? [])];
  const phones = [...new Set(text.match(/\+?\d[\d\s\-().]{7,}\d/g)?.map((p) => p.trim()) ?? [])];
  const addresses: string[] = [];
  return { emails, phones, addresses };
}

function extractText($: cheerio.CheerioAPI): string {
  // Remove script, style, nav, footer, header
  $("script, style, nav, footer, header, noscript, iframe").remove();

  const text = $("body").text();
  // Collapse whitespace
  return text.replace(/\s+/g, " ").trim().slice(0, 10_000);
}

export function scrapeHtml(url: string, html: string): ScrapedPage {
  const $ = cheerio.load(html);
  const title = $("title").text().trim() || $("h1").first().text().trim() || "";
  const textContent = extractText($);
  const contactInfo = extractContactInfo(html);
  const meta = {
    description: $('meta[name="description"]').attr("content") ?? null,
    keywords: $('meta[name="keywords"]').attr("content") ?? null,
    imageUrl: $('meta[property="og:image"]').attr("content") ?? null,
  };

  return { url, title, textContent, contactInfo, meta };
}

export const scraperTool = tool({
  description:
    "Fetch and extract text content from a web page. Returns the page title, text content, contact information (emails, phones), and meta tags.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL to scrape"),
  }),
  execute: async ({ url }) => {
    const html = await fetchFn(url);
    return scrapeHtml(url, html);
  },
});
