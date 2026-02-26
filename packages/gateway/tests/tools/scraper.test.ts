import { describe, it, expect, beforeEach } from "vitest";
import { scraperTool, setScraperFetch, scrapeHtml } from "../../src/tools/scraper.js";

const MOCK_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>Villa Elegante - Wedding Venue</title>
  <meta name="description" content="Beautiful wedding venue in Ischia" />
  <meta property="og:image" content="https://villaelegante.it/images/hero.jpg" />
</head>
<body>
  <header><nav>Menu items</nav></header>
  <main>
    <h1>Villa Elegante</h1>
    <p>A stunning wedding venue on the island of Ischia.</p>
    <p>Contact us at info@villaelegante.it or call +39 081 123 4567</p>
    <p>Via Roma 42, 80077 Ischia, Italy</p>
  </main>
  <script>var analytics = true;</script>
  <footer>Copyright 2024</footer>
</body>
</html>
`;

describe("scrapeHtml", () => {
  it("extracts title and text content", () => {
    const result = scrapeHtml("https://example.com", MOCK_HTML);
    expect(result.title).toBe("Villa Elegante - Wedding Venue");
    expect(result.textContent).toContain("Villa Elegante");
    expect(result.textContent).toContain("stunning wedding venue");
    // Should exclude nav/footer/script
    expect(result.textContent).not.toContain("analytics");
  });

  it("extracts contact info", () => {
    const result = scrapeHtml("https://example.com", MOCK_HTML);
    expect(result.contactInfo.emails).toContain("info@villaelegante.it");
    expect(result.contactInfo.phones.length).toBeGreaterThan(0);
  });

  it("extracts meta tags", () => {
    const result = scrapeHtml("https://example.com", MOCK_HTML);
    expect(result.meta.description).toBe("Beautiful wedding venue in Ischia");
    expect(result.meta.imageUrl).toBe("https://villaelegante.it/images/hero.jpg");
  });

  it("returns null imageUrl when og:image is missing", () => {
    const html = `<html><head><title>No OG</title></head><body>Hello</body></html>`;
    const result = scrapeHtml("https://example.com", html);
    expect(result.meta.imageUrl).toBeNull();
  });
});

describe("scraperTool", () => {
  beforeEach(() => {
    setScraperFetch(async () => MOCK_HTML);
  });

  it("fetches and scrapes a URL", async () => {
    const result = await scraperTool.execute(
      { url: "https://villaelegante.it" },
      { toolCallId: "test", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    expect(result.title).toBe("Villa Elegante - Wedding Venue");
    expect(result.contactInfo.emails).toContain("info@villaelegante.it");
  });
});
