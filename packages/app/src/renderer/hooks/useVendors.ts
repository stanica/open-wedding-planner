import { useRequest } from "./useRequest";

interface Vendor {
  id: number;
  categoryId: number;
  name: string;
  location: string | null;
  status: string;
  description: string | null;
}

interface Category {
  id: number;
  name: string;
  budgetPercentLow: number;
  budgetPercentHigh: number;
  sortOrder: number;
}

export function useVendors(filters?: { categoryId?: number; status?: string }) {
  return useRequest<Vendor[]>("vendors.list", filters);
}

export function useVendor(id: number) {
  return useRequest<Vendor>("vendors.get", { id });
}

export function useCategories() {
  return useRequest<Category[]>("categories.list");
}
