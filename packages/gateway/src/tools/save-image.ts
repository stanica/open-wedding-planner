import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

type FetchFn = (url: string) => Promise<Response>;

export async function saveImageFromUrl(
  url: string,
  vendorId: number,
  imagesDir: string,
  fetchFn: FetchFn = fetch,
): Promise<{ filename: string }> {
  const res = await fetchFn(url);
  const contentType = res.headers.get("content-type")?.split(";")[0]?.trim() ?? "";

  if (!contentType.startsWith("image/")) {
    throw new Error(`Not an image: ${contentType}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > MAX_SIZE) {
    throw new Error(`Image too large: ${buffer.length} bytes`);
  }

  const ext = MIME_TO_EXT[contentType] ?? ".jpg";
  return saveBuffer(buffer, ext, vendorId, imagesDir);
}

export async function saveImageFromBase64(
  base64: string,
  mimeType: string,
  vendorId: number,
  imagesDir: string,
): Promise<{ filename: string }> {
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length > MAX_SIZE) {
    throw new Error(`Image too large: ${buffer.length} bytes`);
  }

  const ext = MIME_TO_EXT[mimeType] ?? ".jpg";
  return saveBuffer(buffer, ext, vendorId, imagesDir);
}

function saveBuffer(
  buffer: Buffer,
  ext: string,
  vendorId: number,
  imagesDir: string,
): { filename: string } {
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const filename = `${hash}${ext}`;
  const dir = path.join(imagesDir, String(vendorId));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, filename), buffer);
  return { filename };
}

export function deleteImageFile(
  vendorId: number,
  filename: string,
  imagesDir: string,
): void {
  const filePath = path.join(imagesDir, String(vendorId), filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
