# Vendor Photo Gallery Design

## Problem
Vendors (including venues) currently support only a single `imageUrl` field. Users want to tell the research agent "grab photos from their homepage" and see those photos in a gallery. Images can come from websites, Gmail attachments, WhatsApp messages, or manual upload.

## Data Model

New `vendor_images` table:

| Column | Type | Description |
|--------|------|-------------|
| id | integer PK | Auto-increment |
| vendorId | integer FK | References vendors.id, cascade delete |
| filename | text | Stored filename (e.g. `a1b2c3d4.jpg`) |
| originalUrl | text | Source URL (if from web), null for manual uploads |
| caption | text | Optional caption/description |
| sortOrder | integer | Display order in grid |
| createdAt | text | Timestamp |

Files stored at: `~/.wedding-planner/images/{vendorId}/{filename}`

Existing `vendors.imageUrl` remains as fallback. Vendor header thumbnail pulls from first gallery image, falling back to `imageUrl`.

## Backend

### Handler: `vendor-images.ts`
- `vendor-images.list` — returns all images for a vendor (sorted by sortOrder)
- `vendor-images.upload` — accepts image buffer + metadata, saves to disk, inserts DB row
- `vendor-images.delete` — deletes file from disk + DB row
- `vendor-images.reorder` — updates sortOrder for a batch of image IDs

### HTTP Routes (Express)
- `GET /images/:vendorId/:filename` — serves image files from disk
- `POST /images/:vendorId` — multipart upload endpoint for manual uploads

### Image Download Utility: `download-image.ts`
- Given a URL, downloads the image, generates hash-based filename, saves to disk
- Validates content-type is image, max size 10MB
- Used by both agent tools and upload endpoint

## Agent Tool: `addVendorImages`

```typescript
{
  vendorId: number,
  images: [
    {
      url: string,        // Option 1: URL — tool downloads it
      data: string,       // Option 2: base64 — tool decodes and saves
      mimeType: string,   // Required with data (e.g. "image/jpeg")
      caption: string,    // Optional
    }
  ]
}
```

Each image provides either `url` or `data`+`mimeType`, not both.

### Scrape Tool Enhancement
- Currently extracts `og:image` only
- Enhance to also extract `<img>` URLs from gallery sections, hero images
- Return as `images: string[]` in tool result

### Research Agent Prompt Update
- Instruct agent to look for gallery/photo pages and use `addVendorImages` to save relevant photos with descriptive captions

## Frontend

### Photos Tab (new tab in VendorDetailView)
- Responsive grid of square-cropped thumbnails (3-4 columns)
- Hover: subtle scale-up
- Empty state: "No photos yet — ask the research agent to find some, or drag and drop your own"

### Lightbox Overlay
- Click thumbnail → full-screen dark overlay with centered image
- Arrow keys / click arrows to navigate
- Esc or click outside to close
- Caption shown below image
- Delete button with confirmation

### Manual Upload
- "Add Photos" button at top of Photos tab
- Click opens Electron file picker (image types)
- Drag-and-drop zone on grid area
- Files uploaded via POST /images/:vendorId
- Grid updates immediately

### Vendor Header Thumbnail
- Pull first gallery image as thumbnail
- Fall back to vendor.imageUrl if no gallery images

## Changes Summary

| Layer | Changes |
|-------|---------|
| DB | New `vendor_images` table |
| Storage | `~/.wedding-planner/images/{vendorId}/{file}` |
| Gateway | `vendor-images` handler, HTTP image serving/upload, `download-image.ts` utility |
| Agent | New `addVendorImages` tool, enhanced `scrape` to surface more image URLs |
| Frontend | Photos tab with grid, lightbox, drag-drop upload, header thumbnail fallback |
