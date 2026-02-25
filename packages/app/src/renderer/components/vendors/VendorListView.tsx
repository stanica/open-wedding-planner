import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Store, ChevronDown, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useVendors, useCategories } from "../../hooks/useVendors";
import { VendorCard } from "./VendorCard";
import { VendorFilters } from "./VendorFilters";
import { EmptyState } from "../common/EmptyState";
import { SkeletonCard } from "../common/Skeleton";

export function VendorListView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [collapsedCategories, setCollapsedCategories] = useState<Set<number>>(new Set());
  const navigate = useNavigate();

  const { data: vendors, loading: vendorsLoading } = useVendors(
    statusFilter ? { status: statusFilter } : undefined,
  );
  const { data: categories, loading: categoriesLoading } = useCategories();

  const loading = vendorsLoading || categoriesLoading;

  const filtered = useMemo(() => {
    if (!vendors) return [];
    if (!search) return vendors;
    const q = search.toLowerCase();
    return vendors.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.location?.toLowerCase().includes(q),
    );
  }, [vendors, search]);

  const grouped = useMemo(() => {
    if (!categories) return [];
    const map = new Map<number, typeof filtered>();
    for (const v of filtered) {
      const list = map.get(v.categoryId) ?? [];
      list.push(v);
      map.set(v.categoryId, list);
    }
    return categories
      .filter((c) => map.has(c.id))
      .map((c) => ({ category: c, vendors: map.get(c.id)! }));
  }, [filtered, categories]);

  function toggleCategory(id: number) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <span className="text-sm text-gray-400">
          {filtered.length} vendor{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <VendorFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
      />

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No vendors found"
          description={search || statusFilter ? "Try adjusting your filters" : "Import vendor data to get started"}
        />
      ) : (
        <div className="space-y-6">
          {grouped.map(({ category, vendors: categoryVendors }) => {
            const isCollapsed = collapsedCategories.has(category.id);
            return (
              <div key={category.id}>
                <button
                  onClick={() => toggleCategory(category.id)}
                  className="flex w-full items-center gap-2 text-left mb-3"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                  <span className="text-sm font-semibold text-gray-300">
                    {category.name}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({categoryVendors.length})
                  </span>
                </button>

                <AnimatePresence>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <AnimatePresence mode="popLayout">
                          {categoryVendors.map((vendor) => (
                            <motion.div
                              key={vendor.id}
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ duration: 0.15 }}
                            >
                              <VendorCard
                                vendor={vendor}
                                onClick={() => navigate(`/vendors/${vendor.id}`)}
                              />
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
