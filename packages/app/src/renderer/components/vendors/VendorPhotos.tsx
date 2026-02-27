import { useState, useCallback, useRef, useEffect } from "react";
import {
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  X,
  ImageIcon,
} from "lucide-react";
import {
  useVendorImages,
  useUploadVendorImage,
  useDeleteVendorImage,
} from "../../hooks/useVendorImages";
import { wsClient } from "../../lib/ws-client";
import { ConfirmDialog } from "../common/ConfirmDialog";

function getImageUrl(vendorId: number, filename: string): string {
  return `http://localhost:${wsClient.gatewayPort}/images/${vendorId}/${filename}`;
}

interface VendorPhotosProps {
  vendorId: number;
}

export function VendorPhotos({ vendorId }: VendorPhotosProps) {
  const { data: images, loading, refetch } = useVendorImages(vendorId);
  const { mutate: uploadImage } = useUploadVendorImage();
  const { mutate: deleteImage, loading: deleting } = useDeleteVendorImage();

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: number;
    caption: string | null;
  } | null>(null);

  const lightboxRef = useRef<HTMLDivElement>(null);

  const imageList = images ?? [];

  // ── Upload helpers ──────────────────────────────────────────────

  const uploadFile = useCallback(
    async (file: { base64: string; mimeType: string }) => {
      await uploadImage({
        vendorId,
        base64: file.base64,
        mimeType: file.mimeType,
      });
    },
    [vendorId, uploadImage],
  );

  const readFileAsBase64 = useCallback(
    (buffer: ArrayBuffer, mimeType: string) => {
      const base64 = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );
      return { base64, mimeType };
    },
    [],
  );

  // ── "Add Photos" via Electron dialog ───────────────────────────

  const handleAddPhotos = useCallback(async () => {
    const result = await window.electronAPI?.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
      ],
    });

    if (!result?.filePaths?.length) return;

    for (const filePath of result.filePaths) {
      const res = await fetch(`file://${filePath}`);
      const buffer = await res.arrayBuffer();
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "png";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
      };
      const file = readFileAsBase64(buffer, mimeMap[ext] ?? "image/png");
      await uploadFile(file);
    }
    refetch();
  }, [uploadFile, readFileAsBase64, refetch]);

  // ── Drag & drop ────────────────────────────────────────────────

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!dragging) setDragging(true);
    },
    [dragging],
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);

      for (const file of Array.from(e.dataTransfer.files)) {
        if (!file.type.startsWith("image/")) continue;
        const buffer = await file.arrayBuffer();
        const { base64 } = readFileAsBase64(buffer, file.type);
        await uploadImage({ vendorId, base64, mimeType: file.type });
      }
      refetch();
    },
    [vendorId, uploadImage, readFileAsBase64, refetch],
  );

  // ── Delete ─────────────────────────────────────────────────────

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget) return;
    await deleteImage({ id: deleteTarget.id });

    // If we're in lightbox, adjust index
    if (lightboxIndex !== null) {
      if (imageList.length <= 1) {
        setLightboxIndex(null);
      } else if (lightboxIndex >= imageList.length - 1) {
        setLightboxIndex(imageList.length - 2);
      }
    }

    setDeleteTarget(null);
    refetch();
  }, [deleteTarget, deleteImage, lightboxIndex, imageList.length, refetch]);

  // ── Lightbox navigation ────────────────────────────────────────

  const lightboxPrev = useCallback(() => {
    setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  }, []);

  const lightboxNext = useCallback(() => {
    setLightboxIndex((i) =>
      i !== null && i < imageList.length - 1 ? i + 1 : i,
    );
  }, [imageList.length]);

  const lightboxClose = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  // Auto-focus lightbox for keyboard events
  useEffect(() => {
    if (lightboxIndex !== null) {
      lightboxRef.current?.focus();
    }
  }, [lightboxIndex]);

  const handleLightboxKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") lightboxClose();
      else if (e.key === "ArrowLeft") lightboxPrev();
      else if (e.key === "ArrowRight") lightboxNext();
    },
    [lightboxClose, lightboxPrev, lightboxNext],
  );

  // ── Loading state ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="aspect-square animate-pulse rounded-lg bg-white/5"
          />
        ))}
      </div>
    );
  }

  // ── Lightbox image ─────────────────────────────────────────────

  const lightboxImage =
    lightboxIndex !== null ? imageList[lightboxIndex] : null;

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      className={`space-y-4 rounded-xl p-1 transition-all ${
        dragging ? "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-900" : ""
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-400">
          {imageList.length} {imageList.length === 1 ? "photo" : "photos"}
        </h3>
        <button
          onClick={handleAddPhotos}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Plus className="h-4 w-4" />
          Add Photos
        </button>
      </div>

      {/* Empty state */}
      {imageList.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 py-16">
          <ImageIcon className="mb-3 h-10 w-10 text-gray-600" />
          <p className="text-sm font-medium text-gray-400">No photos yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Ask the research agent to find some, or drag and drop your own
          </p>
        </div>
      )}

      {/* Photo grid */}
      {imageList.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {imageList.map((image, index) => (
            <button
              key={image.id}
              onClick={() => setLightboxIndex(index)}
              className="group relative aspect-square overflow-hidden rounded-lg bg-white/5"
            >
              <img
                src={getImageUrl(vendorId, image.filename)}
                alt={image.caption ?? ""}
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
              {image.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="truncate text-xs text-white">{image.caption}</p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div
          ref={lightboxRef}
          tabIndex={0}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={lightboxClose}
          onKeyDown={handleLightboxKeyDown}
        >
          {/* Prevent clicks on inner content from closing */}
          <div
            className="relative flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <button
              onClick={lightboxClose}
              className="absolute -top-10 right-0 text-gray-400 transition-colors hover:text-white"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Main image */}
            <img
              src={getImageUrl(vendorId, lightboxImage.filename)}
              alt={lightboxImage.caption ?? ""}
              className="max-h-[80vh] max-w-[90vw] rounded-lg object-contain"
            />

            {/* Caption and counter */}
            <div className="mt-3 text-center">
              {lightboxImage.caption && (
                <p className="text-sm text-gray-300">{lightboxImage.caption}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                {lightboxIndex! + 1} / {imageList.length}
              </p>
            </div>

            {/* Delete button */}
            <button
              onClick={() =>
                setDeleteTarget({
                  id: lightboxImage.id,
                  caption: lightboxImage.caption,
                })
              }
              className="mt-3 flex items-center gap-1.5 rounded-lg bg-red-500/10 px-3 py-1.5 text-sm text-red-400 transition-colors hover:bg-red-500/20"
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </button>
          </div>

          {/* Navigation arrows */}
          {lightboxIndex! > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                lightboxPrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {lightboxIndex! < imageList.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                lightboxNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete photo?"
        message={
          deleteTarget?.caption
            ? `Delete "${deleteTarget.caption}"? This cannot be undone.`
            : "Delete this photo? This cannot be undone."
        }
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
