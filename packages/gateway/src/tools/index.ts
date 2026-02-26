import { ToolRegistry } from "./registry.js";
import { searchTool } from "./search.js";
import { scraperTool } from "./scraper.js";
import { browserTool } from "./browser.js";
import { pdfTool } from "./pdf.js";

export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register({
    name: "search",
    description: "Search the web for wedding venues and vendor information",
    category: "web",
    tool: searchTool,
  });

  registry.register({
    name: "scrape",
    description: "Extract text and contact info from a web page",
    category: "web",
    tool: scraperTool,
  });

  registry.register({
    name: "browse",
    description: "Load a JavaScript-heavy web page using a headless browser",
    category: "web",
    tool: browserTool,
  });

  registry.register({
    name: "parsePdf",
    description: "Download and extract text from a PDF document",
    category: "web",
    tool: pdfTool,
  });

  return registry;
}

export { ToolRegistry } from "./registry.js";
