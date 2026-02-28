import { tool } from "ai";
import { z } from "zod";
import type { Page } from "playwright-core";

export function createPlaywrightTools(page: Page) {
  return {
    navigate: tool({
      description: "Navigate to a URL. Returns the page title and current URL after loading.",
      inputSchema: z.object({
        url: z.string().url().describe("The URL to navigate to"),
      }),
      execute: async ({ url }) => {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        const title = await page.title();
        return { url: page.url(), title };
      },
    }),

    click: tool({
      description: "Click an element on the page. Use CSS selectors or text selectors like 'text=Pricing'.",
      inputSchema: z.object({
        selector: z.string().describe("CSS or text selector (e.g. 'text=Pricing', 'a.nav-link')"),
      }),
      execute: async ({ selector }) => {
        await page.click(selector, { timeout: 10_000 });
        await page.waitForLoadState("networkidle").catch(() => {});
        const title = await page.title();
        return { clicked: selector, url: page.url(), title };
      },
    }),

    type: tool({
      description: "Type text into an input field.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector for the input field"),
        text: z.string().describe("Text to type"),
      }),
      execute: async ({ selector, text }) => {
        await page.fill(selector, text);
        return { filled: selector, text };
      },
    }),

    screenshot: tool({
      description: "Take a screenshot of the current page. Returns a base64-encoded PNG image you can see.",
      inputSchema: z.object({}),
      execute: async () => {
        const buffer = await page.screenshot({ fullPage: false });
        return {
          image: buffer.toString("base64"),
          mimeType: "image/png",
          url: page.url(),
        };
      },
    }),

    extractText: tool({
      description: "Extract text content from the page or a specific element.",
      inputSchema: z.object({
        selector: z.string().optional().describe("CSS selector to extract from. Omit for full page text."),
      }),
      execute: async ({ selector }) => {
        if (selector) {
          const text = await page.locator(selector).textContent() ?? "";
          return { text: text.trim().slice(0, 10_000), selector };
        }
        const text = await page.evaluate(() => {
          const clone = document.body.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("script, style, nav, footer, header, noscript").forEach((el) => el.remove());
          return (clone.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 10_000);
        });
        return { text, url: page.url() };
      },
    }),

    extractLinks: tool({
      description: "Get all links on the current page with their text and URLs.",
      inputSchema: z.object({}),
      execute: async () => {
        const links = await page.$$eval("a[href]", (anchors) =>
          anchors
            .map((a) => ({ text: a.textContent?.trim() ?? "", href: (a as HTMLAnchorElement).href }))
            .filter((l) => l.text && l.href && !l.href.startsWith("javascript:")),
        );
        return { links: links.slice(0, 100), url: page.url() };
      },
    }),

    extractImages: tool({
      description: "Get all image URLs on the current page.",
      inputSchema: z.object({}),
      execute: async () => {
        const images = await page.$$eval("img[src]", (imgs) =>
          (imgs as HTMLImageElement[])
            .map((img) => ({
              src: img.src,
              alt: img.alt || undefined,
              width: img.naturalWidth,
              height: img.naturalHeight,
            }))
            .filter((i) => i.width > 50 && i.height > 50),
        );
        return { images: images.slice(0, 50), url: page.url() };
      },
    }),

    scroll: tool({
      description: "Scroll the page up or down.",
      inputSchema: z.object({
        direction: z.enum(["up", "down"]).describe("Scroll direction"),
        amount: z.number().optional().describe("Pixels to scroll (default 500)"),
      }),
      execute: async ({ direction, amount }) => {
        const px = amount ?? 500;
        const delta = direction === "down" ? px : -px;
        await page.evaluate((d) => window.scrollBy(0, d), delta);
        return { scrolled: direction, pixels: px };
      },
    }),

    waitForSelector: tool({
      description: "Wait for an element to appear on the page.",
      inputSchema: z.object({
        selector: z.string().describe("CSS selector to wait for"),
        timeout: z.number().optional().describe("Max wait time in ms (default 10000)"),
      }),
      execute: async ({ selector, timeout }) => {
        await page.waitForSelector(selector, { timeout: timeout ?? 10_000 });
        return { found: selector };
      },
    }),

    evaluate: tool({
      description: "Run JavaScript code in the browser page context. Returns the result.",
      inputSchema: z.object({
        script: z.string().describe("JavaScript code to execute in the page"),
      }),
      execute: async ({ script }) => {
        const result = await page.evaluate(script);
        return { result };
      },
    }),
  };
}
