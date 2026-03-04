import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Store } from "lucide-react";
import { useVendors, useCategories } from "../../hooks/useVendors";
import { useMutation } from "../../hooks/useRequest";
import { VendorCard } from "./VendorCard";
import { VendorFilters } from "./VendorFilters";
import { VendorTableView } from "./VendorTableView";
import { EmptyState } from "../common/EmptyState";
import { SkeletonCard } from "../common/Skeleton";
import { useVendorFiltersStore } from "../../stores/vendor-filters-store";

const STATUS_ORDER: Record<string, number> = {
  booked: 0, quoted: 1, contacted: 2, researched: 3, rejected: 4,
};

export function VendorListView() {
  const {
    search, setSearch,
    statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter,
    sortBy, setSortBy,
    viewMode, setViewMode,
    favoritesOnly, setFavoritesOnly,
  } = useVendorFiltersStore();
  const navigate = useNavigate();

  const { data: vendors, loading: vendorsLoading } = useVendors(
    statusFilter ? { status: statusFilter } : undefined,
  );
  const { mutate: updateVendor } = useMutation("vendors.update");
  const [optimisticFavorites, setOptimisticFavorites] = useState<Map<number, boolean>>(new Map());
  const { data: categories, loading: categoriesLoading } = useCategories();

  const loading = vendorsLoading || categoriesLoading;

  const filtered = useMemo(() => {
    if (!vendors) return [];
    let result = vendors.map((v) => {
      const optimistic = optimisticFavorites.get(v.id);
      return optimistic !== undefined ? { ...v, favorite: optimistic } : v;
    });
    if (categoryFilter !== null) result = result.filter((v) => v.categoryId === categoryFilter);
    if (favoritesOnly) result = result.filter((v) => v.favorite);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.location?.toLowerCase().includes(q),
      );
    }
    // Sort
    switch (sortBy) {
      case "name-asc":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "name-desc":
        result.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case "newest":
        result.sort((a, b) => b.id - a.id);
        break;
      case "status":
        result.sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
        break;
    }
    return result;
  }, [vendors, search, favoritesOnly, optimisticFavorites, categoryFilter, sortBy]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<number, number>();
    if (!vendors) return counts;
    for (const v of vendors) {
      counts.set(v.categoryId, (counts.get(v.categoryId) ?? 0) + 1);
    }
    return counts;
  }, [vendors]);

  const groupedByCategory = useMemo(() => {
    if (!categories || categoryFilter !== null) return null;

    const groups = new Map<number, typeof filtered>();
    for (const vendor of filtered) {
      const group = groups.get(vendor.categoryId) ?? [];
      group.push(vendor);
      groups.set(vendor.categoryId, group);
    }

    return categories
      .filter((cat) => groups.has(cat.id))
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((cat) => ({ category: cat, vendors: groups.get(cat.id)! }));
  }, [filtered, categories, categoryFilter]);

  const renderVendorCard = (vendor: (typeof filtered)[0]) => (
    <VendorCard
      vendor={vendor}
      onClick={() => navigate(`/vendors/${vendor.id}`)}
      onToggleFavorite={(id, favorite) => {
        setOptimisticFavorites((prev) => new Map(prev).set(id, favorite));
        updateVendor({ id, favorite });
      }}
    />
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Vendors</h1>
        <span className="text-sm text-on-surface-secondary">
          {filtered.length} vendor{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <VendorFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusChange={setStatusFilter}
        favoritesOnly={favoritesOnly}
        onFavoritesChange={setFavoritesOnly}
        categories={categories ?? []}
        categoryFilter={categoryFilter}
        onCategoryChange={setCategoryFilter}
        categoryCounts={categoryCounts}
        sortBy={sortBy}
        onSortChange={setSortBy}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {loading ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="break-inside-avoid mb-3">
              <SkeletonCard />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No vendors found"
          description={search || statusFilter ? "Try adjusting your filters" : "Import vendor data to get started"}
        />
      ) : viewMode === "grid" ? (
        groupedByCategory ? (
          <div className="space-y-8">
            {groupedByCategory.map(({ category, vendors: groupVendors }) => (
              <section key={category.id}>
                <div className="flex items-baseline gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-on-surface">{category.name}</h2>
                  <span className="text-sm text-on-surface-tertiary">
                    {groupVendors.length}
                  </span>
                </div>
                <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
                  {groupVendors.map((vendor) => (
                    <div key={vendor.id} className="break-inside-avoid mb-3">
                      {renderVendorCard(vendor)}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-3">
            {filtered.map((vendor) => (
              <div key={vendor.id} className="break-inside-avoid mb-3">
                {renderVendorCard(vendor)}
              </div>
            ))}
          </div>
        )
      ) : (
        <VendorTableView
          vendors={filtered}
          onVendorClick={(id) => navigate(`/vendors/${id}`)}
          onToggleFavorite={(id, favorite) => {
            setOptimisticFavorites((prev) => new Map(prev).set(id, favorite));
            updateVendor({ id, favorite });
          }}
        />
      )}
    </div>
  );
}
