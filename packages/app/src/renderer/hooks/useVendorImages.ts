import { useRequest, useMutation } from "./useRequest";

export interface VendorImage {
  id: number;
  vendorId: number;
  filename: string;
  originalUrl: string | null;
  caption: string | null;
  sortOrder: number;
  createdAt: string;
}

export function useVendorImages(vendorId: number) {
  return useRequest<VendorImage[]>("vendor-images.list", { vendorId });
}

export function useUploadVendorImage() {
  return useMutation<{
    vendorId: number;
    base64: string;
    mimeType: string;
    caption?: string;
  }>("vendor-images.upload");
}

export function useDeleteVendorImage() {
  return useMutation<{ id: number }>("vendor-images.delete");
}

export function useReorderVendorImages() {
  return useMutation<{ order: Array<{ id: number; sortOrder: number }> }>(
    "vendor-images.reorder",
  );
}
