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

  it("extracts image URLs from page content", () => {
    const htmlWithGallery = `
      <html>
      <head>
        <title>Villa Gallery</title>
        <meta property="og:image" content="https://villa.it/og.jpg" />
      </head>
      <body>
        <main>
          <img src="https://villa.it/gallery/photo1.jpg" alt="Garden" />
          <img src="https://villa.it/gallery/photo2.jpg" alt="Pool" />
          <img src="/small-icon.png" alt="icon" width="20" height="20" />
          <img src="data:image/png;base64,abc" alt="inline" />
        </main>
      </body>
      </html>
    `;
    const result = scrapeHtml("https://villa.it", htmlWithGallery);
    expect(result.images).toBeDefined();
    expect(result.images).toContain("https://villa.it/gallery/photo1.jpg");
    expect(result.images).toContain("https://villa.it/gallery/photo2.jpg");
    // Should not include data URIs
    expect(result.images.every((url: string) => !url.startsWith("data:"))).toBe(true);
  });

  it("resolves relative image URLs", () => {
    const html = `
      <html><body>
        <img src="/images/hero.jpg" alt="Hero" />
      </body></html>
    `;
    const result = scrapeHtml("https://villa.it/about", html);
    expect(result.images).toContain("https://villa.it/images/hero.jpg");
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
